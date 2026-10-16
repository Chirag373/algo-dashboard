"""Read-only quotes with point movement against the previous observed session close."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from math import isfinite
from threading import Lock
from time import monotonic
from zoneinfo import ZoneInfo
from app.services.candles import IST, US_SYMBOLS, timestamp
from app.services.kite_backtest import fetch_exchange_candles

_cache = {}
_locks = defaultdict(Lock)
_pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix="watchlist-quotes")


def quote_from_candles(symbol: str, candles: list[dict]) -> dict:
    tz = ZoneInfo("America/New_York") if symbol in US_SYMBOLS else IST
    valid = {}
    for candle in candles:
        try:
            ts = timestamp(candle["time"])
            if not isfinite(float(candle["close"])) or float(candle["close"]) <= 0:
                continue
            valid[ts] = candle
        except (ValueError, TypeError, KeyError):
            continue
    if not valid:
        raise ValueError("No quote history available")
    ordered = sorted(valid)
    latest_ts = ordered[-1]
    last = valid[latest_ts]
    session = datetime.fromtimestamp(latest_ts, tz).date()
    previous = [ts for ts in ordered if datetime.fromtimestamp(ts, tz).date() < session]
    prev_close = float(valid[previous[-1]]["close"]) if previous else None
    ltp = float(last["close"])
    change = round(ltp - prev_close, 2) if prev_close is not None else None
    return {"symbol": symbol, "ltp": ltp, "previousClose": prev_close,
            "chg": change, "pct": round(change / prev_close * 100, 2) if prev_close else None,
            "high": last.get("high"), "low": last.get("low"), "open": last.get("open"),
            "time": last["time"], "changeBasis": "previous session close"}


def get_market_quote(symbol: str) -> dict:
    symbol = symbol.strip().upper()
    with _locks[symbol]:
        cached = _cache.get(symbol)
        if cached and monotonic() - cached[0] < 15:
            return cached[1]
        result = quote_from_candles(symbol, fetch_exchange_candles(symbol, "5m", 7))
        _cache[symbol] = (monotonic(), result)
        return result


def batch_quotes(symbols: list[str]) -> dict:
    def fetch(symbol):
        try:
            return symbol, get_market_quote(symbol)
        except Exception:
            return symbol, {"symbol": symbol, "ltp": 0, "chg": None, "pct": None, "previousClose": None}
    return dict(_pool.map(fetch, dict.fromkeys(s.strip().upper() for s in symbols if s.strip())))
