"""Trading engine: single source of truth for orders, positions, risk and strategies.

Everything funnels through the same risk checks, whether an order comes from
the UI or from a strategy. State is persisted to SQLite after each change.
"""
import logging
import math
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from app.db.database import Database
from app.schemas import TIMEFRAMES, OrderIn, RiskIn, StrategyIn
from app.services.broker import PaperBroker
from app.services.feed import (
    PRICE_BOOK,
    STOCK_SYMBOLS,
    Feed,
    FeedTick,
)

log = logging.getLogger("engine")

DEFAULT_RISK = {
    "maxDailyLoss": 15000,
    "maxOpenPositions": 5,
    "maxCapitalPerTrade": 150000,
    "totalCapital": 300000,
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
        self.live_enabled = live_enabled
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

        self.market_time = datetime.now(timezone.utc).replace(hour=9, minute=15, second=0, microsecond=0)
        self.market_open = False
        self.market_date = self.market_time.strftime("%Y-%m-%d")
        self.realized_today = sum(t["pnl"] for t in db.trades_for_date(self.market_date))
        self.loss_enforced_date: str | None = None
        self.squared_date: str | None = None
        self.orb: dict[str, dict[str, dict]] = {}
        self.publish: Callable[[], Awaitable[None]] | None = None
        self.save()

    # ------------------------------------------------------------ persistence
    def save(self) -> None:
        self.db.set("killed", self.killed)
        self.db.set("risk", self.risk)
        self.db.set("strategies", self.strategies)
        self.db.set("positions", self.positions)
        self.db.set("pending", self.pending)
        self.db.set("alerts", self.alerts[:50])

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
    def _risk_reject_reason(self, symbol: str, qty: int, price: float) -> str | None:
        if symbol not in self.prices:
            return "Unknown symbol"
        if self.killed:
            return "Kill switch is engaged"
        if not self.market_open:
            return "Market is closed"
        if qty <= 0:
            return "Quantity must be positive"
        if len(self.positions) >= self.risk["maxOpenPositions"]:
            return f"Max open positions ({self.risk['maxOpenPositions']}) reached"
        if price * qty > self.risk["maxCapitalPerTrade"]:
            return "Exceeds max capital per trade"
        used = sum(p["avg"] * p["qty"] for p in self.positions)
        if used + price * qty > self.risk["totalCapital"]:
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
            "fee": self.broker.fee_per_order,
            "tsl": tsl,
        }
        self.positions.insert(0, pos)
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
        self.risk = r.model_dump()
        self.save()

    # ------------------------------------------------------------- strategies
    def _find_strategy(self, sid: str) -> dict:
        s = next((x for x in self.strategies if x["id"] == sid), None)
        if not s:
            raise EngineError("Strategy not found", 404)
        return s

    def create_strategy(self, data: StrategyIn) -> dict:
        s = {**data.model_dump(), "id": _uid("s"), "stage": "Draft", "status": "stopped", "version": 1}
        self.strategies.append(s)
        self.save()
        return s

    def update_strategy(self, sid: str, data: StrategyIn) -> dict:
        s = self._find_strategy(sid)
        if s["status"] == "running":
            raise EngineError("Stop the strategy before editing", 409)
        if data.template != s["template"]:
            raise EngineError("Template cannot be changed after creation", 400)
        s.update(data.model_dump())
        s["version"] += 1
        self.orb.pop(sid, None)
        self.save()
        return s

    def delete_strategy(self, sid: str) -> None:
        s = self._find_strategy(sid)
        if s["status"] == "running":
            raise EngineError("Stop the strategy before deleting", 409)
        self.strategies = [x for x in self.strategies if x["id"] != sid]
        self.orb.pop(sid, None)
        self.save()

    def clone_strategy(self, sid: str) -> dict:
        s = self._find_strategy(sid)
        c = {**s, "params": dict(s["params"]), "id": _uid("s"), "name": f"{s['name']} (copy)",
             "version": 1, "stage": "Draft", "status": "stopped"}
        self.strategies.append(c)
        self.save()
        return c

    def set_strategy_status(self, sid: str, status: str) -> None:
        s = self._find_strategy(sid)
        if status == "running":
            if self.killed:
                raise EngineError("Release the kill switch before starting a strategy")
            if s["stage"] not in ("Paper", "Live"):
                raise EngineError("Promote the strategy to Paper before running it")
            if s["template"] not in ENGINE_TEMPLATES:
                raise EngineError(
                    f"The {s['template']} template has no execution engine yet. "
                    "Only ORB strategies can run."
                )
        s["status"] = status
        self.alert("info", f"Strategy '{s['name']}' {status}")
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
    def on_tick(self, tick: FeedTick) -> None:
        if tick.new_day:
            self.market_date = tick.market_time.strftime("%Y-%m-%d")
            self.realized_today = 0.0
            self.orb.clear()
            self.squared_date = None
            self.alert("info", f"New trading day {self.market_date}")
        self.market_time = tick.market_time
        self.market_open = tick.market_open
        if not tick.market_open:
            self.db.set("prices", self.prices)
            return

        for sym, bar in tick.bars.items():
            self.prices[sym] = bar.close

        self._fill_pending(tick)
        self._monitor_positions(tick)
        self._square_off_times()
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
            reason = self._risk_reject_reason(o["symbol"], o["qty"], o["price"])
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
            if (buy and bar.low <= pos["sl"]) or (not buy and bar.high >= pos["sl"]):
                reason = "Trailing stop hit" if pos.get("tsl") and pos["tsl"].get("locked") else "Stop-loss hit"
                self._close_position(pos, pos["sl"], reason)
                self.alert("warn", f"{pos['symbol']} {reason.lower()}")
                continue
            if (buy and bar.high >= pos["target"]) or (not buy and bar.low <= pos["target"]):
                self._close_position(pos, pos["target"], "Target hit")
                self.alert("info", f"{pos['symbol']} target hit")
                continue
            tsl = pos.get("tsl")
            if tsl:
                best = bar.high if buy else bar.low
                gain = ((best - pos["avg"]) if buy else (pos["avg"] - best)) / pos["avg"] * 100
                if gain >= tsl["lockPct"]:
                    tsl["locked"] = True
                    step = tsl["stepPct"]
                    n = math.floor((gain - tsl["lockPct"]) / step) if step > 0 else 0
                    shift = n * step
                    new_sl = pos["avg"] * (1 + shift / 100) if buy else pos["avg"] * (1 - shift / 100)
                    if (buy and new_sl > pos["sl"]) or (not buy and new_sl < pos["sl"]):
                        pos["sl"] = _r2(new_sl)

    def _square_off_times(self) -> None:
        now = _hhmm(self.market_time)
        if now >= self.risk["autoSquareOffTime"] and self.squared_date != self.market_date:
            self.squared_date = self.market_date
            if self.positions:
                self.square_off_all("Auto square-off")
        for s in self.strategies:
            t = s["params"].get("squareOffTime")
            if t and now >= t:
                for pos in [p for p in self.positions if p["strategyId"] == s["id"]]:
                    self._close_position(pos, self.prices[pos["symbol"]], "Strategy square-off")

    def _enforce_loss_limit(self) -> None:
        if self.loss_limit_hit() and self.loss_enforced_date != self.market_date:
            self.loss_enforced_date = self.market_date
            self.killed = True
            for pos in list(self.positions):
                self._close_position(pos, self.prices[pos["symbol"]], "Max daily loss hit")
            self.alert("critical", "Max daily loss reached. Kill switch engaged, all positions closed.")

    # -------------------------------------------------------------- strategies
    @staticmethod
    def _universe(instrument: str) -> list[str]:
        if instrument == "NIFTY":
            return ["NIFTY FUT"]
        if instrument == "BANKNIFTY":
            return ["BANKNIFTY FUT"]
        return list(STOCK_SYMBOLS)

    def _run_strategies(self, tick: FeedTick) -> None:
        if self.killed:
            return
        for s in self.strategies:
            if s["status"] == "running" and s["template"] == "ORB":
                try:
                    self._run_orb(s, tick)
                except Exception:  # a bad strategy must never stop the engine
                    log.exception("ORB strategy %s failed", s["id"])
                    s["status"] = "stopped"
                    self.alert("critical", f"Strategy '{s['name']}' crashed and was stopped")

    def _run_orb(self, s: dict, tick: FeedTick) -> None:
        """Opening range breakout.

        Range = high/low of the first N candles (N = rangeCandleCount) of the
        strategy timeframe from 09:15. After the range completes: close above the
        high -> BUY, below the low -> SELL. A symbol re-arms only after price
        returns inside the range. SL is initialSlPercent; TSL locks breakeven at
        tslLockPercent profit then trails by tslTrailStep per step of extra gain.
        """
        p = s["params"]
        tf = TIMEFRAMES[s["timeframe"]]
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
            qty = int(p["perTradeAmount"] // bar.close)
            if qty < 1:
                continue
            side = "BUY" if bar.close > d["high"] else "SELL"
            reason = self._risk_reject_reason(sym, qty, bar.close)
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
        return {
            "mode": self.mode,
            "liveEnabled": self.live_enabled,
            "killed": self.killed,
            "feed": {"kind": self.feed.kind, "marketOpen": self.market_open},
            "marketTime": self.market_time.strftime("%H:%M:%S"),
            "marketDate": self.market_date,
            "prices": self.prices,
            "strategies": self.strategies,
            "positions": positions,
            "orders": orders,
            "closed": self.db.recent_trades(200),
            "alerts": self.alerts[:30],
            "risk": self.risk,
            "openPnl": _r2(self.open_pnl()),
            "realizedPnl": _r2(self.realized_today),
            "dayPnl": _r2(self.day_pnl()),
            "lossLimitHit": self.loss_limit_hit(),
        }
