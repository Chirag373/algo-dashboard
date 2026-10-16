"""Trading engine: single source of truth for orders, positions, risk and strategies.

Everything funnels through the same risk checks, whether an order comes from
the UI or from a strategy. State is persisted to SQLite after each change.
"""
import logging
import copy
from contextlib import contextmanager
import math
import sqlite3
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from app.db.database import Database
from app.schemas import OrderIn, RiskIn, StrategyIn
from app.services.broker import PaperBroker
from app.services.candles import aggregate, timeframe_minutes, normalize, US_SYMBOLS, IST
from zoneinfo import ZoneInfo
from app.services.conditions import evaluate
from app.services.feed import (
    INDEX_SYMBOLS,
    PRICE_BOOK,
    STOCK_SYMBOLS,
    Feed,
    FeedTick,
)

log = logging.getLogger("engine")

DEFAULT_RISK = {
    "maxDailyLoss": 50000,
    "maxOpenPositions": 10,
    "maxCapitalPerTrade": 5000000,
    "totalCapital": 10000000,
    "autoSquareOffTime": "15:19",
}

SEED_STRATEGIES = [
    {
        "id": "orb-nifty50",
        "name": "ORB Nifty 50 Stocks",
        "template": "ORB",
        "instrument": "NIFTY 50 Stocks",
        "timeframe": "5m",
        "stage": "Paper",
        "status": "stopped",
        "version": 1,
        "params": {
            "initialSlPercent": 2,
            "tslLockPercent": 1.5,
            "tslTrailStep": 0.5,
            "perTradeAmount": 10000,
            "rangeCandleCount": 5,
            "maxTradesPerStock": 2,
            "squareOffTime": "15:19",
        },
        "entryRules": [],
        "exitRules": [],
    }
]

ENGINE_TEMPLATES = {"ORB"}  # templates that have an execution engine
NEXT_STAGE = {"Draft": "Backtest", "Backtest": "Paper", "Paper": "Live"}


class EngineError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _uid(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def _hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _r2(x: float) -> float:
    return round(x, 2)


class TradingEngine:
    def __init__(
        self,
        db: Database,
        feed: Feed,
        broker: PaperBroker,
        live_enabled: bool = False,
    ):
        self.db = db
        self.feed = feed
        self.broker = broker
        if not broker.is_paper:
            raise EngineError("Only paper brokers are permitted", 403)
        self.live_enabled = False
        self.mode = "paper"
        self.seq = db.max_seq()

        self.killed: bool = db.get("killed", False)
        self.risk: dict = db.get("risk", dict(DEFAULT_RISK))
        self.strategies: list[dict] = db.get("strategies") or [dict(s) for s in SEED_STRATEGIES]
        self.positions: list[dict] = db.get("positions", [])
        self.pending: list[dict] = db.get("pending", [])
        self.alerts: list[dict] = db.get("alerts", [])

        saved_prices = db.get("prices")
        self.prices: dict[str, float] = {**PRICE_BOOK, **(saved_prices or {})}
        if saved_prices and hasattr(feed, "prices"):
            feed.prices.update(saved_prices)  # type: ignore[attr-defined]

        self.market_time = getattr(feed, "now", datetime.now(IST))
        self.market_open = False
        self.market_date = self.market_time.strftime("%Y-%m-%d")
        self.realized_today = sum(t["pnl"] for t in db.trades_for_date(self.market_date))
        self.risk_runtime = db.get("riskRuntime", {})
        self._refresh_risk_runtime()
        self.loss_enforced_date: str | None = None
        self.squared_date: str | None = None
        self.orb: dict[str, dict[str, dict]] = db.get("orbRuntime", {}) if db.get("orbRuntimeDate") == self.market_date else {}
        self.runtime: dict[str, dict] = db.get("strategyRuntime", {})
        for strategy in self.strategies:
            try:
                strategy.update(StrategyIn.model_validate(strategy).model_dump())
                if strategy.get("stage") == "Live":
                    strategy.update(stage="Paper", status="stopped")
            except ValueError:
                strategy["status"] = "stopped"
                log.exception("Invalid saved strategy %s stopped", strategy.get("id"))
        self.last_bars: dict = db.get("lastBars", {})
        self.publish: Callable[[], Awaitable[None]] | None = None
        self.save()

    # ------------------------------------------------------------ persistence
    def save(self) -> None:
        self.db.set("killed", self.killed)
        self.db.set("risk", self.risk)
        self.db.set("riskRuntime", self.risk_runtime)
        self.db.set("strategies", self.strategies)
        self.db.set("positions", self.positions)
        self.db.set("pending", self.pending)
        self.db.set("alerts", self.alerts[:50])
        self.db.set("strategyRuntime", self.runtime)
        self.db.set("orbRuntime", self.orb)
        self.db.set("orbRuntimeDate", self.market_date)
        self.db.set("lastBars", self.last_bars)

    def _next_seq(self) -> int:
        self.seq += 1
        return self.seq

    # ---------------------------------------------------------------- helpers
    def alert(self, level: str, message: str) -> None:
        self.alerts.insert(
            0,
            {"id": _uid("a"), "time": self.market_time.strftime("%H:%M:%S"), "level": level, "message": message},
        )
        del self.alerts[50:]
        log.info("[%s] %s", level, message)

    def _record_order(self, order: dict) -> None:
        self.db.upsert_order(order, order.setdefault("_seq", self._next_seq()))

    def _order(self, symbol, side, typ, qty, price, status, strategy_id, note="") -> dict:
        order = {
            "id": _uid("o"),
            "time": self.market_time.strftime("%H:%M:%S"),
            "symbol": symbol,
            "side": side,
            "type": typ,
            "qty": qty,
            "price": _r2(price),
            "status": status,
            "strategyId": strategy_id,
            "note": note,
        }
        self._record_order(order)
        return order

    def _open_pnl(self, p: dict) -> float:
        ltp = self.prices.get(p["symbol"], p["avg"])
        return (ltp - p["avg"] if p["side"] == "BUY" else p["avg"] - ltp) * p["qty"]

    def open_pnl(self) -> float:
        return sum(self._open_pnl(p) for p in self.positions)

    def day_pnl(self) -> float:
        return self.realized_today + self.open_pnl()

    def loss_limit_hit(self) -> bool:
        return self.day_pnl() <= -abs(self.risk["maxDailyLoss"])

    # ------------------------------------------------------------ risk checks
    def _refresh_risk_runtime(self):
        equity = float(self.risk["totalCapital"]) + self.day_pnl()
        if self.risk_runtime.get("date") != self.market_date:
            self.risk_runtime = {"date": self.market_date, "entries": 0,
                                 "peak": max(float(self.risk["totalCapital"]), equity),
                                 "blockedStrategies": [], "trackingStartedAt": self.market_time.isoformat()}
        self.risk_runtime["peak"] = max(self.risk_runtime["peak"], equity)

    def risk_status(self):
        peak = self.risk_runtime["peak"]
        equity = float(self.risk["totalCapital"]) + self.day_pnl()
        drawdown = max(0, peak - equity)
        stats = self.db.strategy_stats(self.market_date)
        strategies = {}
        for s in self.strategies:
            sid = s["id"]
            positions = [p for p in self.positions if p["strategyId"] == sid]
            pnl = stats.get(sid, {}).get("dayRealizedPnl", 0) + sum(self._open_pnl(p) for p in positions)
            limit = self.risk.get("strategyLimits", {}).get(sid, {})
            loss_hit = bool(limit.get("maxDailyLoss") and pnl <= -limit["maxDailyLoss"])
            strategies[sid] = {"dayPnl": _r2(pnl), "positions": len(positions),
                               "blocked": loss_hit or sid in self.risk_runtime["blockedStrategies"]}
        pct = drawdown / peak * 100 if peak > 0 else 0
        return {"entriesToday": self.risk_runtime["entries"], "drawdownAmount": _r2(drawdown),
                "drawdownPct": pct, "drawdownLimitHit": bool(self.risk.get("maxDrawdownPct") and pct >= self.risk["maxDrawdownPct"]),
                "tradeLimitHit": bool(self.risk.get("maxTradesPerDay") and self.risk_runtime["entries"] >= self.risk["maxTradesPerDay"]),
                "trackingStartedAt": self.risk_runtime["trackingStartedAt"], "strategies": strategies}

    def _risk_reject_reason(self, symbol: str, qty: int, price: float, is_strategy: bool = False,
                            strategy_id: str = "manual", sl_pct: float = 2.0) -> str | None:
        if symbol not in self.prices:
            return "Unknown symbol"
        if self.killed:
            return "Kill switch is engaged"
        if not self.market_open:
            return "Market is closed"
        if self.loss_limit_hit():
            return "Daily loss limit reached"
        status = self.risk_status()
        if status["drawdownLimitHit"]:
            return "Daily drawdown limit reached"
        if status["tradeLimitHit"]:
            return "Max trades per day reached"
        strategy = status["strategies"].get(strategy_id, {})
        if strategy.get("blocked"):
            return "Strategy daily loss limit reached"
        position_limit = self.risk.get("strategyLimits", {}).get(strategy_id, {}).get("maxOpenPositions")
        if position_limit and strategy.get("positions", 0) >= position_limit:
            return "Strategy max open positions reached"
        risk_pct = self.risk.get("riskPerTradePct", 0)
        if risk_pct and price * qty * sl_pct / 100 > float(self.risk["totalCapital"]) * risk_pct / 100:
            return "Planned stop-loss risk exceeds risk per trade limit"
        if qty <= 0:
            return "Quantity must be positive"
        if len(self.positions) >= self.risk.get("maxOpenPositions", 10):
            return f"Max open positions ({self.risk.get('maxOpenPositions', 10)}) reached"

        is_index = symbol in INDEX_SYMBOLS or "FUT" in symbol or "NIFTY" in symbol or "SENSEX" in symbol
        trade_cost = (price * qty * 0.1) if is_index else (price * qty)
        max_trade_cap = float(self.risk.get("maxCapitalPerTrade", 5000000))
        if trade_cost > max_trade_cap:
            return "Exceeds max capital per trade"
        used = sum(
            (p["avg"] * p["qty"] * (0.1 if (p["symbol"] in INDEX_SYMBOLS or "FUT" in p["symbol"]) else 1.0))
            for p in self.positions
        )
        total_cap = float(self.risk.get("totalCapital", 10000000))
        if used + trade_cost > total_cap:
            return "Exceeds total capital"
        return None

    # ----------------------------------------------------------------- orders
    def _open_position(
        self,
        symbol: str,
        side: str,
        qty: int,
        fill_price: float,
        strategy_id: str,
        note: str,
        sl_pct: float = 2.0,
        target_pct: float = 4.0,
        tsl: dict | None = None,
        order_type: str = "MARKET",
        record: bool = True,
    ) -> dict:
        sign = 1 if side == "BUY" else -1
        pos = {
            "id": _uid("p"),
            "strategyId": strategy_id,
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "avg": _r2(fill_price),
            "sl": _r2(fill_price * (1 - sign * sl_pct / 100)),
            "target": _r2(fill_price * (1 + sign * target_pct / 100)),
            "openedAt": self.market_time.strftime("%H:%M:%S"),
            "openedTimestamp": self.market_time.timestamp(),
            "entryBar": self.last_bars.get(symbol),
            "fee": self.broker.fee_per_order,
            "tsl": tsl,
        }
        self.positions.insert(0, pos)
        self.risk_runtime["entries"] += 1
        if record:
            self._order(symbol, side, order_type, qty, fill_price, "COMPLETE", strategy_id, note)
        return pos

    def place_order(self, req: OrderIn, strategy_id: str = "manual") -> dict:
        ltp = self.prices.get(req.symbol)
        reason = self._risk_reject_reason(req.symbol, req.qty, req.price or ltp or 0)
        if reason:
            self._order(req.symbol, req.side, req.type, req.qty, req.price or ltp or 0,
                        "REJECTED", strategy_id, reason)
            self.alert("warn", f"Order rejected: {reason}")
            self.save()
            raise EngineError(reason)

        assert ltp is not None
        if req.type == "LIMIT":
            marketable = (req.side == "BUY" and req.price >= ltp) or (req.side == "SELL" and req.price <= ltp)
            if not marketable:
                order = self._order(req.symbol, req.side, "LIMIT", req.qty, req.price, "OPEN",
                                    strategy_id, "Waiting for price")
                self.pending.append(order)
                self.save()
                return {"message": f"Limit order placed: {req.side} {req.qty} {req.symbol} @ {req.price:.2f}"}

        fill = self.broker.execute_market(req.symbol, req.side, req.qty, ltp)
        self._open_position(req.symbol, req.side, req.qty, fill.price, strategy_id,
                            "Paper fill" if self.mode == "paper" else "Live fill",
                            order_type=req.type)
        self.save()
        return {"message": f"{req.side} {req.qty} {req.symbol} @ {fill.price:.2f}"}

    def cancel_order(self, order_id: str) -> None:
        for o in self.pending:
            if o["id"] == order_id:
                o["status"] = "CANCELLED"
                o["note"] = "Cancelled by user"
                self._record_order(o)
                self.pending.remove(o)
                self.save()
                return
        raise EngineError("Open order not found", 404)

    def _close_position(self, pos: dict, price: float, reason: str) -> None:
        price = _r2(price)
        sign = 1 if pos["side"] == "BUY" else -1
        gross = (price - pos["avg"]) * sign * pos["qty"]
        fees = pos.get("fee", 0) + self.broker.fee_per_order
        pnl = _r2(gross - fees)
        trade = {
            "id": _uid("t"),
            "strategyId": pos["strategyId"],
            "symbol": pos["symbol"],
            "side": pos["side"],
            "qty": pos["qty"],
            "entry": pos["avg"],
            "exit": _r2(price),
            "pnl": pnl,
            "fees": _r2(fees),
            "reason": reason,
            "closedAt": self.market_time.strftime("%H:%M:%S"),
        }
        self.db.add_trade(trade, self.market_date, self._next_seq())
        self.realized_today += pnl
        self._order(pos["symbol"], "SELL" if pos["side"] == "BUY" else "BUY", "MARKET",
                    pos["qty"], price, "COMPLETE", pos["strategyId"], reason)
        self.positions = [p for p in self.positions if p["id"] != pos["id"]]
        self.db.add_execution_log(pos["strategyId"], "exit", {"positionId": pos["id"], "trade": trade})
        log.info("Position %s exited: %s price=%s pnl=%s", pos["id"], reason, price, pnl)

    def close_position(self, position_id: str, reason: str = "Manual exit") -> None:
        pos = next((p for p in self.positions if p["id"] == position_id), None)
        if not pos:
            raise EngineError("Position not found", 404)
        self._close_position(pos, self.prices.get(pos["symbol"], pos["avg"]), reason)
        self.save()

    def square_off_all(self, reason: str = "Square-off all") -> int:
        n = len(self.positions)
        for pos in list(self.positions):
            self._close_position(pos, self.prices.get(pos["symbol"], pos["avg"]), reason)
        if n:
            self.alert("warn", f"Squared off {n} position(s): {reason}")
        self.save()
        return n

    # --------------------------------------------------------------- controls
    def set_kill(self, engaged: bool) -> None:
        self.killed = engaged
        self.alert("critical" if engaged else "info",
                   "Kill switch engaged" if engaged else "Kill switch released")
        self.save()

    def set_mode(self, mode: str) -> None:
        if mode == "live":
            raise EngineError(
                "Live trading is not available: no live broker adapter is configured.", 403
            )
        self.mode = mode

    def update_risk(self, r: RiskIn) -> None:
        unknown = set(r.strategyLimits) - {s["id"] for s in self.strategies}
        if unknown:
            raise EngineError("Risk limits refer to a strategy that no longer exists", 422)
        if r.totalCapital != self.risk["totalCapital"]:
            self.risk_runtime["peak"] += r.totalCapital - self.risk["totalCapital"]
        self.risk = r.model_dump()
        self._refresh_risk_runtime()
        self.save()

    # ------------------------------------------------------------- strategies
    def _find_strategy(self, sid: str) -> dict:
        s = next((x for x in self.strategies if x["id"] == sid), None)
        if not s:
            raise EngineError("Strategy not found", 404)
        return s

    def create_strategy(self, data: StrategyIn) -> dict:
        s = {**data.model_dump(), "id": _uid("s"), "stage": "Paper" if data.template == "Custom" else "Draft", "status": "running" if data.template == "Custom" else "stopped", "version": 1}
        self.strategies.append(s)
        self.runtime[s["id"]] = {"activatedAt": self.market_time.timestamp(), "symbols": {}}
        self._execution_event(s, "created", {"configuration": data.model_dump(), "status": s["status"]})
        self.alert("info", f"Strategy '{s['name']}' saved ({s['status']}, Paper Trading)")
        self.save()
        return s

    def update_strategy(self, sid: str, data: StrategyIn) -> dict:
        s = self._find_strategy(sid)
        if s["status"] != "stopped":
            raise EngineError("Stop the strategy before editing", 409)
        if any(p["strategyId"] == sid for p in self.positions):
            raise EngineError("Close this strategy's positions before editing", 409)
        if data.template != s["template"]:
            raise EngineError("Template cannot be changed after creation", 400)
        s.update(data.model_dump())
        s["version"] += 1
        self.orb.pop(sid, None)
        self.runtime[sid] = {"activatedAt": self.market_time.timestamp(), "symbols": {}}
        if s["template"] == "Custom":
            s.update(status="running", stage="Paper")
        self._execution_event(s, "updated", {"configuration": data.model_dump(), "version": s["version"]})
        self.save()
        return s

    def delete_strategy(self, sid: str) -> None:
        s = self._find_strategy(sid)
        if s["status"] != "stopped" or any(p["strategyId"] == sid for p in self.positions):
            raise EngineError("Stop the strategy and close its positions before deleting", 409)
        self.strategies = [x for x in self.strategies if x["id"] != sid]
        self.orb.pop(sid, None)
        self.runtime.pop(sid, None)
        self.save()

    def clone_strategy(self, sid: str) -> dict:
        s = self._find_strategy(sid)
        c = {**copy.deepcopy(s), "params": dict(s["params"]), "id": _uid("s"), "name": f"{s['name']} (copy)",
             "version": 1, "stage": "Draft", "status": "stopped"}
        self.strategies.append(c)
        self.save()
        return c

    def set_strategy_status(self, sid: str, status: str) -> None:
        s = self._find_strategy(sid)
        if status not in {"running", "paused", "stopped"}:
            raise EngineError("Invalid execution status")
        if status == "running":
            if self.killed:
                raise EngineError("Release the kill switch before starting a strategy")
            if s["template"] not in {"Custom", "ORB"}:
                raise EngineError("This template does not have an execution engine")
            # Validate persisted strategies as well as new API payloads.
            try:
                StrategyIn.model_validate(s)
            except ValueError as exc:
                raise EngineError(f"Invalid saved strategy: {exc}") from None
            s["stage"] = "Paper"
            if s["status"] != "running":
                self.runtime.setdefault(sid, {"symbols": {}})["activatedAt"] = self.market_time.timestamp()
        # Pausing/stopping suppress entries; protective exits remain active.
        # Signal latches survive all status changes and restarts.
        s["status"] = status
        self._execution_event(s, "control", {"status": status})
        self.alert("info", f"Strategy '{s['name']}' {status} (Paper Trading)")
        self.save()

    def promote_strategy(self, sid: str, stage: str) -> None:
        s = self._find_strategy(sid)
        if s["status"] == "running":
            raise EngineError("Stop the strategy before changing its stage", 409)
        if stage == "Live":
            if not self.live_enabled:
                raise EngineError("Cannot promote to Live: live trading is not enabled", 403)
            raise EngineError("Cannot promote to Live: no live broker adapter is configured", 403)
        if NEXT_STAGE.get(s["stage"]) != stage and stage != s["stage"]:
            raise EngineError(f"Cannot move from {s['stage']} to {stage}")
        s["stage"] = stage
        self.save()

    # -------------------------------------------------------------- tick loop
    @contextmanager
    def atomic(self):
        keys = ("seq", "killed", "risk", "risk_runtime", "strategies", "positions", "pending", "alerts", "runtime", "orb", "last_bars", "prices", "realized_today", "market_date", "market_time", "market_open", "squared_date", "loss_enforced_date")
        before = {key: copy.deepcopy(getattr(self, key)) for key in keys}
        rejected = None
        try:
            with self.db.transaction():
                try:
                    yield
                except EngineError as exc:
                    # Rejected orders and their reasons remain in history.
                    rejected = exc
        except BaseException:
            for key, value in before.items():
                setattr(self, key, value)
            raise
        if rejected:
            raise rejected

    def on_tick(self, tick: FeedTick) -> None:
        with self.atomic():
            self._process_tick(tick)

    def _process_tick(self, tick: FeedTick) -> None:
        if tick.new_day:
            self.market_date = tick.market_time.strftime("%Y-%m-%d")
            self.realized_today = 0.0
            self.orb.clear()
            self.squared_date = None
            self.alert("info", f"New trading day {self.market_date}")
        self.market_time = tick.market_time
        self.market_open = tick.market_open
        self.market_date = tick.market_time.strftime("%Y-%m-%d")
        self._refresh_risk_runtime()
        if not tick.market_open:
            self.db.set("prices", self.prices)
            self.save()
            return

        fresh = {}
        for sym, bar in tick.bars.items():
            try:
                normalize(bar)
            except (ValueError, TypeError):
                log.warning("Ignoring invalid market data for %s", sym)
                continue
            stamp = tick.market_time.timestamp()
            signature = [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume]
            previous = self.last_bars.get(sym)
            if bar.time > stamp or stamp-bar.time > 120 or (previous and (bar.time < previous[0] or signature == previous)):
                continue
            self.last_bars[sym] = signature
            fresh[sym] = bar
            self.prices[sym] = bar.close
        tick = FeedTick(tick.market_time, tick.market_open, tick.new_day, fresh)
        self._refresh_risk_runtime()

        self._fill_pending(tick)
        self._monitor_positions(tick)
        self._square_off_times(tick)
        self._refresh_risk_runtime()
        self._enforce_strategy_risk(tick)
        self._enforce_loss_limit()
        self._run_strategies(tick)
        self._enforce_loss_limit()
        self.db.set("prices", self.prices)
        self.save()

    def _fill_pending(self, tick: FeedTick) -> None:
        for o in list(self.pending):
            bar = tick.bars.get(o["symbol"])
            if not bar:
                continue
            touched = bar.low <= o["price"] if o["side"] == "BUY" else bar.high >= o["price"]
            if not touched:
                continue
            self.pending.remove(o)
            reason = self._risk_reject_reason(o["symbol"], o["qty"], o["price"], strategy_id=o["strategyId"])
            if reason:
                o.update(status="REJECTED", note=reason)
                self.alert("warn", f"Limit order rejected: {reason}")
            else:
                o.update(status="COMPLETE", note="Limit filled")
                self._open_position(o["symbol"], o["side"], o["qty"], o["price"],
                                    o["strategyId"], "Limit filled", order_type="LIMIT",
                                    record=False)
            self._record_order(o)

    def _monitor_positions(self, tick: FeedTick) -> None:
        for pos in list(self.positions):
            bar = tick.bars.get(pos["symbol"])
            if not bar:
                continue
            buy = pos["side"] == "BUY"
            # A candle's pre-entry extremes must never stop a new position.
            same_bar = bar.time < pos.get("openedTimestamp", 0)
            low, high = (bar.close, bar.close) if same_bar else (bar.low, bar.high)
            baseline = pos.get("entryBar")
            if same_bar and baseline and bar.time == baseline[0]:
                # Newly observed extremes in the entry minute are valid; older
                # extremes belong to the period before the fill.
                low = bar.low if bar.low < baseline[3] else bar.close
                high = bar.high if bar.high > baseline[2] else bar.close
            gap = bar.close if same_bar else bar.open
            if (buy and low <= pos["sl"]) or (not buy and high >= pos["sl"]):
                reason = "Trailing stop hit" if pos.get("tsl") and pos["tsl"].get("locked") else "Stop-loss hit"
                fill = min(gap, pos["sl"]) if buy else max(gap, pos["sl"])
                self._close_position(pos, fill, reason)
                self.alert("warn", f"{pos['symbol']} {reason.lower()}")
                continue
            if (buy and high >= pos["target"]) or (not buy and low <= pos["target"]):
                fill = max(gap, pos["target"]) if buy else min(gap, pos["target"])
                self._close_position(pos, fill, "Target hit")
                self.alert("info", f"{pos['symbol']} target hit")
                continue
            tsl = pos.get("tsl")
            if tsl:
                best = high if buy else low
                gain = ((best - pos["avg"]) if buy else (pos["avg"] - best)) / pos["avg"] * 100
                if gain >= tsl["lockPct"]:
                    tsl["locked"] = True
                    step = tsl["stepPct"]
                    n = math.floor((gain - tsl["lockPct"]) / step) if step > 0 else 0
                    shift = n * step
                    new_sl = pos["avg"] * (1 + shift / 100) if buy else pos["avg"] * (1 - shift / 100)
                    if (buy and new_sl > pos["sl"]) or (not buy and new_sl < pos["sl"]):
                        pos["sl"] = _r2(new_sl)

    def _symbol_time(self, symbol: str) -> str:
        if self.market_time.tzinfo and symbol in US_SYMBOLS:
            return _hhmm(self.market_time.astimezone(ZoneInfo("America/New_York")))
        return _hhmm(self.market_time)

    def _square_off_times(self, tick: FeedTick) -> None:
        for pos in list(self.positions):
            if pos["symbol"] not in tick.bars:
                continue
            now = self._symbol_time(pos["symbol"])
            strategy = next((s for s in self.strategies if s["id"] == pos["strategyId"]), None)
            cutoff = strategy["params"].get("squareOffTime") if strategy else None
            if now >= self.risk["autoSquareOffTime"] or (cutoff and now >= cutoff):
                self._close_position(pos, self.prices[pos["symbol"]], "Strategy square-off" if cutoff and now >= cutoff else "Auto square-off")

    def _enforce_loss_limit(self) -> None:
        drawdown_hit = self.risk_status()["drawdownLimitHit"]
        if (self.loss_limit_hit() or drawdown_hit) and (self.loss_enforced_date != self.market_date or not self.killed or self.positions):
            self.loss_enforced_date = self.market_date
            self.killed = True
            for pos in list(self.positions):
                self._close_position(pos, self.prices[pos["symbol"]], "Daily drawdown limit hit" if drawdown_hit else "Max daily loss hit")
            self.alert("critical", "Daily drawdown limit reached. Kill switch engaged, all positions closed." if drawdown_hit else "Max daily loss reached. Kill switch engaged, all positions closed.")

    def _enforce_strategy_risk(self, tick):
        status = self.risk_status()
        for sid, state in status["strategies"].items():
            if not state["blocked"]:
                continue
            if sid not in self.risk_runtime["blockedStrategies"]:
                self.risk_runtime["blockedStrategies"].append(sid)
                self.alert("warn", f"Strategy daily loss limit reached: {sid}. New entries blocked for today.")
            for pos in list(self.positions):
                if pos["strategyId"] == sid and pos["symbol"] in tick.bars:
                    self._close_position(pos, self.prices[pos["symbol"]], "Strategy daily loss limit hit")

    @staticmethod
    def _universe(instrument: str) -> list[str]:
        inst = (instrument or "NIFTY 50").strip()
        if inst in ("NIFTY", "NIFTY 50"):
            return ["NIFTY 50"]
        if inst == "NIFTY FUT":
            return ["NIFTY FUT"]
        if inst in ("BANKNIFTY", "NIFTY BANK"):
            return ["BANKNIFTY"]
        if inst == "BANKNIFTY FUT":
            return ["BANKNIFTY FUT"]
        if inst == "FINNIFTY":
            return ["FINNIFTY"]
        if inst == "FINNIFTY FUT":
            return ["FINNIFTY FUT"]
        if inst == "SENSEX":
            return ["SENSEX"]
        if inst == "SENSEX FUT":
            return ["SENSEX FUT"]
        if inst == "NIFTY 50 Stocks":
            return list(STOCK_SYMBOLS)
        return [inst]

    def _run_strategies(self, tick: FeedTick) -> None:
        if self.killed:
            return
        for sid in [s["id"] for s in self.strategies]:
            s = self._find_strategy(sid)
            if s["status"] in {"running", "paused"}:
                try:
                    with self.atomic():
                        if s.get("template") == "ORB" and s["status"] == "running":
                            self._run_orb(s, tick)
                        elif s.get("template") == "Custom" or s.get("entryRules"):
                            self._run_custom(s, tick)
                except sqlite3.Error:
                    # Database failures roll back the whole tick for safe retry.
                    raise
                except Exception as exc:
                    log.exception("Strategy %s (%s) failed", s.get("id"), s.get("name"))
                    s = self._find_strategy(sid)
                    self._execution_event(s, "error", {"message": str(exc)})
                    s["status"] = "stopped"
                    self.alert("critical", f"Strategy '{s.get('name')}' encountered an error and was stopped")

    def _execution_event(self, s: dict, kind: str, data: dict) -> None:
        self.db.add_execution_log(s["id"], kind, data)
        log.info("strategy=%s event=%s %s", s["id"], kind, data)

    def _run_custom(self, s: dict, tick: FeedTick) -> None:
        p = s["params"]
        runtime = self.runtime.setdefault(s["id"], {"activatedAt": tick.market_time.timestamp(), "symbols": {}})
        for sym in self._universe(s["instrument"]):
            state = runtime["symbols"].setdefault(sym, {})
            bar = tick.bars.get(sym)
            if not bar and self.feed.kind == "real_market":
                history = getattr(self.feed, "history", {}).get(sym, [])
                bar = history[-1] if history else None
            if not bar or not 0 <= tick.market_time.timestamp() - bar.time <= 120:
                message = getattr(self.feed, "errors", {}).get(sym) or "Waiting for fresh market data"
                if state.get("message") != message:
                    self._execution_event(s, "waiting", {"symbol": sym, "message": message})
                state["message"] = message
                continue
            if hasattr(self.feed, "candles"):
                candles = self.feed.candles(sym, s["timeframe"], tick.market_time)
            else:
                candles = aggregate(getattr(self.feed, "history", {}).get(sym, []), s["timeframe"], tick.market_time, sym)
            if not candles:
                state["message"] = "Waiting for complete timeframe candles"
                continue
            latest = candles[-1]
            end = latest["end"]
            if state.get("lastCandle", -1) >= latest["time"]:
                continue
            # Consume old data without trading historical signals at today's price.
            state["lastCandle"] = latest["time"]
            if end <= runtime["activatedAt"] or tick.market_time.timestamp() - end > 120:
                state["message"] = "Waiting for a new candle after activation"
                continue
            entry = evaluate(s["entryRules"], candles)
            previous = state.get("matched", False)
            if entry.matched is not None:
                state["matched"] = entry.matched
            state["conditions"] = entry.conditions
            state["message"] = "Insufficient history or volume" if entry.matched is None else ("Entry conditions satisfied" if entry.matched else "Waiting for entry conditions")
            self._execution_event(s, "evaluation", {"symbol": sym, "candle": latest["time"], "matched": entry.matched, "conditions": entry.conditions})
            position = next((x for x in self.positions if x["strategyId"] == s["id"] and x["symbol"] == sym), None)
            if position:
                exits = s.get("exitRules", [])
                if exits:
                    result = evaluate(exits, candles)
                    self._execution_event(s, "exit_evaluation", {"symbol": sym, "conditions": result.conditions, "matched": result.matched})
                    if result.matched:
                        self._close_position(position, bar.close, "Exit conditions satisfied")
                continue
            if not entry.matched or previous or s["status"] != "running":
                continue
            if self._symbol_time(sym) >= p["squareOffTime"] or self._symbol_time(sym) >= self.risk["autoSquareOffTime"]:
                continue
            self._execution_event(s, "signal", {"symbol": sym, "candle": latest["time"]})
            qty = int(p["quantity"])
            reason = self._risk_reject_reason(sym, qty, bar.close, is_strategy=True, strategy_id=s["id"], sl_pct=p["stopLossPercent"])
            if reason:
                self._order(sym, "BUY", "MARKET", qty, bar.close, "REJECTED", s["id"], reason)
                self._execution_event(s, "rejected", {"symbol": sym, "reason": reason})
                state["message"] = reason
                continue
            fill = self.broker.execute_market(sym, "BUY", qty, bar.close)
            pos = self._open_position(sym, "BUY", qty, fill.price, s["id"], "Builder entry (Paper)", sl_pct=p["stopLossPercent"], target_pct=p["targetPercent"])
            self._execution_event(s, "entry", {"symbol": sym, "position": pos, "signalCandle": latest["time"]})
            self.alert("info", f"{s['name']}: BUY {qty} {sym} @ {fill.price:.2f} (Paper)")

    def _run_orb(self, s: dict, tick: FeedTick) -> None:
        """Opening range breakout.

        Range = high/low of the first N candles (N = rangeCandleCount) of the
        strategy timeframe from 09:15. After the range completes: close above the
        high -> BUY, below the low -> SELL. A symbol re-arms only after price
        returns inside the range. SL is initialSlPercent; TSL locks breakeven at
        tslLockPercent profit then trails by tslTrailStep per step of extra gain.
        """
        p = s["params"]
        tf = timeframe_minutes(s["timeframe"])
        n = int(p["rangeCandleCount"])
        now_min = tick.market_time.hour * 60 + tick.market_time.minute
        range_end = 9 * 60 + 15 + n * tf
        cutoff = p["squareOffTime"]
        state = self.orb.setdefault(s["id"], {})

        for sym in self._universe(s["instrument"]):
            bar = tick.bars.get(sym)
            if not bar:
                continue
            d = state.setdefault(sym, {"high": -math.inf, "low": math.inf, "trades": 0, "armed": True})
            if now_min < range_end:
                d["high"] = max(d["high"], bar.high)
                d["low"] = min(d["low"], bar.low)
                continue
            if d["high"] == -math.inf or _hhmm(tick.market_time) >= cutoff:
                continue
            if any(x["strategyId"] == s["id"] and x["symbol"] == sym for x in self.positions):
                continue
            if d["low"] <= bar.close <= d["high"]:
                d["armed"] = True
                continue
            if not d["armed"] or d["trades"] >= int(p["maxTradesPerStock"]):
                continue
            if p.get("quantity"):
                qty = max(1, int(p["quantity"]))
            else:
                qty = max(1, int(p.get("perTradeAmount", 150000) // bar.close))
            if qty < 1:
                continue
            side = "BUY" if bar.close > d["high"] else "SELL"
            reason = self._risk_reject_reason(sym, qty, bar.close, is_strategy=True, strategy_id=s["id"], sl_pct=float(p["initialSlPercent"]))
            if reason:
                d["armed"] = False
                self._order(sym, side, "MARKET", qty, bar.close, "REJECTED", s["id"], reason)
                self.alert("warn", f"{s['name']}: {sym} {side} rejected: {reason}")
                continue
            fill = self.broker.execute_market(sym, side, qty, bar.close)
            sl_pct = float(p["initialSlPercent"])
            self._open_position(
                sym, side, qty, fill.price, s["id"], f"ORB {'breakout' if side == 'BUY' else 'breakdown'}",
                sl_pct=sl_pct, target_pct=sl_pct * 2,
                tsl={"lockPct": float(p["tslLockPercent"]), "stepPct": float(p["tslTrailStep"]), "locked": False},
            )
            d["trades"] += 1
            d["armed"] = False
            self.alert("info", f"{s['name']}: {side} {qty} {sym} @ {fill.price:.2f}")

    # --------------------------------------------------------------- snapshot
    def snapshot(self) -> dict[str, Any]:
        positions = [
            {k: v for k, v in p.items() if k not in ("tsl", "fee")}
            | {"ltp": self.prices.get(p["symbol"], p["avg"])}
            for p in self.positions
        ]
        orders = [{k: v for k, v in o.items() if k != "_seq"} for o in self.db.recent_orders(200)]

        enhanced_strategies = []
        for s in self.strategies:
            strat_copy = dict(s)
            sym = self._universe(strat_copy.get("instrument", "NIFTY 50"))[0]
            clean_sym = sym.replace(" FUT", "").strip()
            ltp = self.prices.get(clean_sym) or self.prices.get(sym, 0.0)
            strat_copy["currentPrice"] = ltp
            states = self.runtime.get(s["id"], {}).get("symbols", {})
            strat_copy["execution"] = states
            first = next(iter(states.values()), {})
            conditions = first.get("conditions", [])
            if conditions:
                c = conditions[0]
                strat_copy["liveIndicators"] = {
                    "leftName": c["indicator"], "leftValue": c["left"],
                    "rightName": c["value"], "rightValue": c["right"],
                    "operator": c["operator"], "lastCandleTime": str(first.get("lastCandle", "")),
                    "candleClose": ltp, "armed": not first.get("matched", False),
                }
            enhanced_strategies.append(strat_copy)

        return {
            "mode": self.mode,
            "liveEnabled": self.live_enabled,
            "killed": self.killed,
            "feed": {"kind": self.feed.kind, "marketOpen": self.market_open},
            "marketTime": self.market_time.strftime("%H:%M:%S"),
            "marketDate": self.market_date,
            "prices": self.prices,
            "strategies": enhanced_strategies,
            "positions": positions,
            "orders": orders,
            "closed": self.db.recent_trades(200),
            "strategyStats": self.db.strategy_stats(self.market_date),
            "alerts": self.alerts[:30],
            "risk": self.risk,
            "riskStatus": self.risk_status(),
            "openPnl": _r2(self.open_pnl()),
            "realizedPnl": _r2(self.realized_today),
            "dayPnl": _r2(self.day_pnl()),
            "lossLimitHit": self.loss_limit_hit(),
        }
