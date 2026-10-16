"""Read-only NIFTY chart data, separate from execution prices and trading P&L."""
from datetime import datetime, timedelta
from math import isfinite
from threading import Lock
from time import monotonic
from zoneinfo import ZoneInfo

from app.services.kite_backtest import fetch_exchange_candles

IST = ZoneInfo("Asia/Kolkata")
PERIODS = {"1D": ("5m", 7, 1), "1W": ("15m", 10, 7), "1M": ("1h", 35, 30), "3M": ("1d", 100, 90)}
_cache = {}
_lock = Lock()


def nifty_chart(period: str) -> dict:
    interval, fetch_days, display_days = PERIODS[period]
    with _lock:
        cached = _cache.get(period)
        if cached and monotonic() - cached[0] < 45:
            return cached[1]
        raw = fetch_exchange_candles("NIFTY 50", interval, fetch_days)
        bars = {}
        now = datetime.now(IST)
        for candle in raw:
            try:
                dt = datetime.fromisoformat(str(candle["time"]))
                dt = dt.replace(tzinfo=IST) if dt.tzinfo is None else dt.astimezone(IST)
                prices = {key: float(candle[key]) for key in ("open", "high", "low", "close")}
                if dt > now or not all(isfinite(v) and v > 0 for v in prices.values()):
                    continue
                bars[int(dt.timestamp())] = {"time": int(dt.timestamp()), **prices}
            except (ValueError, KeyError, TypeError):
                continue
        ordered = [bars[key] for key in sorted(bars)]
        if not ordered:
            raise ValueError("NIFTY history is unavailable from the market data provider. Please retry shortly.")
        last_date = datetime.fromtimestamp(ordered[-1]["time"], IST).date()
        start_date = last_date - timedelta(days=display_days - 1)
        visible = [b for b in ordered if datetime.fromtimestamp(b["time"], IST).date() >= start_date]
        earlier = [b for b in ordered if datetime.fromtimestamp(b["time"], IST).date() < last_date]
        reference = earlier[-1]["close"] if period == "1D" and earlier else visible[0]["close"]
        last = visible[-1]
        result = {
            "symbol": "NIFTY 50", "period": period, "interval": interval,
            "source": "Yahoo Finance · polled market data", "data": visible,
            "lastPrice": last["close"], "change": round(last["close"] - reference, 2),
            "changePct": round((last["close"] / reference - 1) * 100, 2),
            "changeLabel": "vs previous session close" if period == "1D" and earlier else "over displayed period",
            "asOf": last["time"], "fetchedAt": int(now.timestamp()),
        }
        _cache[period] = (monotonic(), result)
        return result
