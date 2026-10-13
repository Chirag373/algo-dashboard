"""Trading engine: single source of truth for orders, positions, risk and strategies.

Everything funnels through the same risk checks, whether an order comes from
the UI or from a strategy. State is persisted to SQLite after each change.
"""
import logging
import math
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from app.db.database import Database
from app.schemas import TIMEFRAMES, OrderIn, RiskIn, StrategyIn
from app.services.broker import PaperBroker
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
        self._candle_cache: dict[str, tuple[float, list[dict]]] = {}
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
    def _risk_reject_reason(self, symbol: str, qty: int, price: float, is_strategy: bool = False) -> str | None:
        if symbol not in self.prices:
            return "Unknown symbol"
        if self.killed:
            return "Kill switch is engaged"
        if not self.market_open:
            return "Market is closed"
        if qty <= 0:
            return "Quantity must be positive"
        if len(self.positions) >= self.risk.get("maxOpenPositions", 10):
            return f"Max open positions ({self.risk.get('maxOpenPositions', 10)}) reached"

        if not is_strategy:
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
            s["stage"] = "Paper"
            # Reset runtime state so strategy starts fresh with no stale flags
            self.orb.pop(sid, None)
        elif status == "stopped":
            self.orb.pop(sid, None)
        s["status"] = status
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
        for s in self.strategies:
            if s["status"] == "running":
                try:
                    if s.get("template") == "ORB":
                        self._run_orb(s, tick)
                    elif s.get("template") == "Custom" or s.get("entryRules"):
                        self._run_custom(s, tick)
                except Exception:  # a bad strategy must never stop the engine
                    log.exception("Strategy %s (%s) failed", s.get("id"), s.get("name"))
                    s["status"] = "stopped"
                    self.alert("critical", f"Strategy '{s.get('name')}' encountered an error and was stopped")

    def _get_candles(self, symbol: str, timeframe: str) -> list[dict]:
        clean_sym = symbol.replace(" FUT", "").strip()
        cache_key = f"{clean_sym}_{timeframe}"
        now_ts = time.time()

        cached = self._candle_cache.get(cache_key)
        if cached and (now_ts - cached[0]) < 8.0:
            return cached[1]

        candles = []
        try:
            from app.services.kite_backtest import fetch_historical_candles
            candles = fetch_historical_candles(clean_sym, timeframe, days_back=10)
        except Exception:
            try:
                from app.services.kite_backtest import fetch_exchange_candles
                candles = fetch_exchange_candles(clean_sym, timeframe, days_back=10)
            except Exception:
                pass

        if candles:
            self._candle_cache[cache_key] = (now_ts, candles)
            return candles
        elif cached:
            return cached[1]
        return []

    def _get_indicator_series(self, ind_str: str, closes: list[float]) -> list[float | None]:
        """Compute the full time-series of indicator values across historical closes."""
        if not closes:
            return []
        clean = ind_str.strip()
        match = re.match(r"^(EMA|SMA|RSI)\s*\(?(\d+)?\)?$", clean, re.IGNORECASE)
        if match:
            ind_type = match.group(1).upper()
            period = int(match.group(2)) if match.group(2) else (9 if ind_type == "EMA" else 20)
            from app.services.kite_backtest import calc_ema, calc_sma, calc_rsi
            if ind_type == "EMA":
                return calc_ema(closes, period)
            elif ind_type == "SMA":
                return calc_sma(closes, period)
            elif ind_type == "RSI":
                return calc_rsi(closes, period)

        if clean.lower() in ("price", "close", "price (close)", "ltp"):
            return [float(c) for c in closes]

        # Check if constant number (e.g. "50", "30", "25000")
        try:
            val = float(clean)
            return [val] * len(closes)
        except ValueError:
            return [float(closes[-1])] * len(closes)

    def _calculate_indicator(self, ind_str: str, history_bars: list[Any]) -> float:
        """Parse and calculate latest indicator value like 'EMA 9', 'EMA 21', 'Price', 'Number'."""
        if not history_bars:
            return 0.0
        closes = [b.close if hasattr(b, "close") else b["close"] for b in history_bars]
        series = self._get_indicator_series(ind_str, closes)
        for val in reversed(series):
            if val is not None:
                return round(float(val), 2)
        return round(float(closes[-1]), 2) if closes else 0.0

    def _evaluate_rule(
        self,
        rule: dict,
        closes: list[float],
        sym_state: dict,
        rule_key: str,
        last_candle_time: str,
    ) -> bool:
        """
        Evaluate a single rule (e.g. EMA 9 crosses above EMA 25).
        Returns True ONLY when the rule condition is genuinely satisfied on a live bar,
        and never enters prematurely upon startup or when lines were already crossed previously.
        """
        if len(closes) < 2:
            return False

        left_ind = rule.get("indicator", "EMA 9")
        right_ind = rule.get("value", "EMA 21")
        op = rule.get("operator", "crosses above").strip().lower()

        left_series = self._get_indicator_series(left_ind, closes)
        right_series = self._get_indicator_series(right_ind, closes)

        if len(left_series) < 2 or len(right_series) < 2:
            return False

        prev_l = left_series[-2]
        curr_l = left_series[-1]
        prev_r = right_series[-2]
        curr_r = right_series[-1]

        if curr_l is None or curr_r is None:
            return False

        r_state = sym_state.setdefault(rule_key, {
            "armed": False,
            "initialized": False,
            "last_trigger_candle": None,
        })

        # Baseline initialization on strategy startup:
        # Prevent premature triggers from historical bars completed prior to activation.
        if not r_state["initialized"]:
            r_state["initialized"] = True
            r_state["last_trigger_candle"] = last_candle_time
            if op == "crosses above":
                # Armed only if left is currently under right, ready to cross above in future
                r_state["armed"] = (curr_l <= curr_r)
            elif op == "crosses below":
                # Armed only if left is currently above right, ready to cross below in future
                r_state["armed"] = (curr_l >= curr_r)
            else:
                r_state["armed"] = True
            return False

        # Crossover evaluation
        if op == "crosses above":
            # Re-arm if price dips back below or equal
            if curr_l <= curr_r:
                r_state["armed"] = True
            # True crossover: was <= on previous candle, is > on current candle, was armed, not yet triggered on this candle
            if prev_l is not None and prev_r is not None and prev_l <= prev_r and curr_l > curr_r:
                if r_state.get("armed", False) and r_state.get("last_trigger_candle") != last_candle_time:
                    r_state["armed"] = False
                    r_state["last_trigger_candle"] = last_candle_time
                    return True
            return False

        elif op == "crosses below":
            # Re-arm if price crosses back above or equal
            if curr_l >= curr_r:
                r_state["armed"] = True
            # True crossover: was >= on previous candle, is < on current candle, was armed, not yet triggered on this candle
            if prev_l is not None and prev_r is not None and prev_l >= prev_r and curr_l < curr_r:
                if r_state.get("armed", False) and r_state.get("last_trigger_candle") != last_candle_time:
                    r_state["armed"] = False
                    r_state["last_trigger_candle"] = last_candle_time
                    return True
            return False

        elif op in ("greater than", "is above", ">"):
            return curr_l > curr_r

        elif op in ("less than", "is below", "<"):
            return curr_l < curr_r

        elif op in ("equals", "=="):
            return abs(curr_l - curr_r) < 0.01

        return False

    def _run_custom(self, s: dict, tick: FeedTick) -> None:
        """Execute custom rule-based strategies (e.g. EMA 9 crosses above EMA 21) in Paper Trading mode."""
        rules = s.get("entryRules") or []
        if not rules:
            return
        p = s.get("params", {})
        cutoff = p.get("squareOffTime", "15:15")
        if _hhmm(tick.market_time) >= cutoff:
            return

        state = self.orb.setdefault(s["id"], {})

        for sym in self._universe(s.get("instrument", "NIFTY 50")):
            tf = s.get("timeframe", "5m")
            history_bars = self._get_candles(sym, tf)

            bar = tick.bars.get(sym)
            if history_bars:
                last_c = history_bars[-1]
                if not bar:
                    from app.services.feed import Bar
                    bar = Bar(
                        symbol=sym,
                        time=int(datetime.now().timestamp()),
                        open=last_c["open"],
                        high=last_c["high"],
                        low=last_c["low"],
                        close=last_c["close"],
                    )
                else:
                    bar.close = last_c["close"]
                self.prices[sym] = bar.close
            elif not bar:
                curr_p = self.prices.get(sym) or self.prices.get(sym.replace(" FUT", "")) or 0
                if curr_p:
                    from app.services.feed import Bar
                    bar = Bar(symbol=sym, time=int(datetime.now().timestamp()), open=curr_p, high=curr_p, low=curr_p, close=curr_p)
                else:
                    continue

            self.prices[sym] = bar.close

            if not history_bars and hasattr(self.feed, "history") and sym in self.feed.history:
                history_bars = self.feed.history[sym]
            if len(history_bars) < 3:
                history_bars = [bar]

            closes = [b.close if hasattr(b, "close") else b["close"] for b in history_bars]
            last_candle_time = str(history_bars[-1].get("time") if isinstance(history_bars[-1], dict) else getattr(history_bars[-1], "time", ""))

            sym_state = state.setdefault(sym, {})

            # 1. If already holding a position for this strategy & symbol, evaluate exit rules
            open_pos = next((x for x in self.positions if x["strategyId"] == s["id"] and x["symbol"] == sym), None)
            if open_pos:
                exit_rules = s.get("exitRules") or []
                if exit_rules:
                    exit_passed = True
                    for idx, erule in enumerate(exit_rules):
                        erule_key = f"exit_{idx}"
                        if not self._evaluate_rule(erule, closes, sym_state, erule_key, last_candle_time):
                            exit_passed = False
                            break
                    if exit_passed:
                        self._close_position(
                            open_pos, bar.close,
                            f"Custom Exit: {exit_rules[0].get('indicator')} {exit_rules[0].get('operator')} {exit_rules[0].get('value')}"
                        )
                        self.alert("info", f"{s['name']}: {sym} exited @ {bar.close:.2f} (Exit Rule satisfied)")
                continue

            # 2. Evaluate entry rules
            all_passed = True
            for idx, rule in enumerate(rules):
                rule_key = f"entry_{idx}"
                if not self._evaluate_rule(rule, closes, sym_state, rule_key, last_candle_time):
                    all_passed = False
                    break

            if all_passed:
                qty = max(1, int(p.get("quantity") or 100))

                side = "BUY"
                reason = self._risk_reject_reason(sym, qty, bar.close, is_strategy=True)
                if reason:
                    self._order(sym, side, "MARKET", qty, bar.close, "REJECTED", s["id"], reason)
                    self.alert("warn", f"{s['name']}: {sym} {side} rejected: {reason}")
                    continue

                fill = self.broker.execute_market(sym, side, qty, bar.close)
                sl_pct = float(p.get("stopLossPercent") or p.get("stopLoss") or 1.0)
                target_pct = float(p.get("targetPercent") or p.get("targetProfit") or 2.0)

                self._open_position(
                    sym, side, qty, fill.price, s["id"],
                    f"Custom Rule Entry: {rules[0].get('indicator')} {rules[0].get('operator')} {rules[0].get('value')}",
                    sl_pct=sl_pct, target_pct=target_pct,
                )
                self.alert("info", f"{s['name']} triggered: {side} {qty} {sym} @ {fill.price:.2f}")

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
            if p.get("quantity"):
                qty = max(1, int(p["quantity"]))
            else:
                qty = max(1, int(p.get("perTradeAmount", 150000) // bar.close))
            if qty < 1:
                continue
            side = "BUY" if bar.close > d["high"] else "SELL"
            reason = self._risk_reject_reason(sym, qty, bar.close, is_strategy=True)
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
            sym = strat_copy.get("instrument", "NIFTY 50")
            clean_sym = sym.replace(" FUT", "").strip()
            ltp = self.prices.get(clean_sym) or self.prices.get(sym, 0.0)
            strat_copy["currentPrice"] = ltp
            rules = s.get("entryRules") or []
            if rules:
                rule0 = rules[0]
                left_ind = rule0.get("indicator", "EMA 9")
                right_ind = rule0.get("value", "EMA 25")
                tf = s.get("timeframe", "5m")
                candles = self._get_candles(clean_sym, tf)
                if candles:
                    closes = [c["close"] for c in candles]
                    l_val = self._calculate_indicator(left_ind, candles)
                    r_val = self._calculate_indicator(right_ind, candles)
                    strat_state = self.orb.get(s["id"], {}).get(clean_sym, {})
                    is_armed = strat_state.get("entry_0", {}).get("armed", True)
                    strat_copy["liveIndicators"] = {
                        "leftName": left_ind,
                        "leftValue": l_val,
                        "rightName": right_ind,
                        "rightValue": r_val,
                        "operator": rule0.get("operator", "crosses above"),
                        "lastCandleTime": str(candles[-1].get("time", "")),
                        "candleClose": closes[-1] if closes else ltp,
                        "armed": is_armed,
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
            "alerts": self.alerts[:30],
            "risk": self.risk,
            "openPnl": _r2(self.open_pnl()),
            "realizedPnl": _r2(self.realized_today),
            "dayPnl": _r2(self.day_pnl()),
            "lossLimitHit": self.loss_limit_hit(),
        }
