"""
Kite Connect Backtest Service
- Fetches real historical OHLCV data from Zerodha Kite API
- Runs indicator-based backtest (EMA, SMA, RSI, etc.) on real candles
- Returns per-day results with trade log
"""

from __future__ import annotations

import datetime
import os
from pathlib import Path
import threading
import hashlib
import json
import math
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import settings

# ─────────────────────────── Kite token store (in-memory) ────────────────────
_ACCESS_TOKEN: str = ""
_TOKEN_LOCK = threading.RLock()
_TOKEN_PATH = Path(settings.DB_PATH).parent / ".kite-session.json"


def set_access_token(token: str) -> None:
    global _ACCESS_TOKEN
    with _TOKEN_LOCK:
        if token:
            _TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
            temporary = _TOKEN_PATH.with_suffix(".tmp")
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as output:
                json.dump({"access_token": token, "api_key": settings.KITE_API_KEY}, output)
            os.chmod(temporary, 0o600)
            os.replace(temporary, _TOKEN_PATH)
        else:
            _TOKEN_PATH.unlink(missing_ok=True)
        _ACCESS_TOKEN = token
        settings.KITE_ACCESS_TOKEN = token


def get_access_token() -> str:
    global _ACCESS_TOKEN
    with _TOKEN_LOCK:
        if _ACCESS_TOKEN or settings.KITE_ACCESS_TOKEN:
            return _ACCESS_TOKEN or settings.KITE_ACCESS_TOKEN
        try:
            saved = json.loads(_TOKEN_PATH.read_text())
            if saved.get("api_key") == settings.KITE_API_KEY:
                _ACCESS_TOKEN = saved.get("access_token", "")
        except (OSError, ValueError):
            pass
        return _ACCESS_TOKEN


# ─────────────────────────── Login helpers ────────────────────────────────────
def get_login_url() -> str:
    """Return the Kite login URL the user must open to get the request_token."""
    return "https://kite.zerodha.com/connect/login?" + urllib.parse.urlencode({"api_key":settings.KITE_API_KEY,"v":3})


def generate_session(request_token: str) -> dict:
    """Server-side token exchange using Kite's documented REST contract.

    https://kite.trade/docs/connect/v3/user/#authentication-and-token-exchange
    """
    checksum = hashlib.sha256((settings.KITE_API_KEY+request_token+settings.KITE_API_SECRET).encode()).hexdigest()
    body = urllib.parse.urlencode({"api_key":settings.KITE_API_KEY,"request_token":request_token,"checksum":checksum}).encode()
    request = urllib.request.Request("https://api.kite.trade/session/token",data=body,headers={"X-Kite-Version":"3"})
    try:
        with urllib.request.urlopen(request,timeout=20) as response:
            payload = json.loads(response.read())
    except Exception:
        raise ValueError("Kite token exchange failed. Check API credentials, redirect URL and the new request token.") from None
    data = payload.get("data",{})
    if payload.get("status") != "success" or not data.get("access_token"):
        raise ValueError(payload.get("message","Kite did not return an access token"))
    set_access_token(data["access_token"])
    return data


# ─────────────────────────── Instrument lookup ───────────────────────────────
# Nifty 50 index Kite instrument token
NIFTY_INSTRUMENTS = {
    "INDIA VIX": {"token": 264969, "exchange": "NSE", "tradingsymbol": "INDIA VIX"},
    "NIFTY 50": {"token": 256265, "exchange": "NSE", "tradingsymbol": "NIFTY 50"},
    "NIFTY": {"token": 256265, "exchange": "NSE", "tradingsymbol": "NIFTY 50"},
    "NIFTY FUT": {"token": 256265, "exchange": "NSE", "tradingsymbol": "NIFTY 50"},
    "BANKNIFTY": {"token": 260105, "exchange": "NSE", "tradingsymbol": "NIFTY BANK"},
    "NIFTY BANK": {"token": 260105, "exchange": "NSE", "tradingsymbol": "NIFTY BANK"},
    "SENSEX": {"token": 265, "exchange": "BSE", "tradingsymbol": "SENSEX"},
}

KITE_INTERVALS = {
    "1m": "minute",
    "5m": "5minute",
    "15m": "15minute",
    "30m": "30minute",
    "1h": "60minute",
    "1hrs": "60minute",
    "4h": "60minute",   # Kite max is 60min; we resample for 4h
    "1d": "day",
    "day": "day",
}


def _kite_headers() -> dict:
    token = get_access_token()
    return {
        "X-Kite-Version": "3",
        "Authorization": f"token {settings.KITE_API_KEY}:{token}",
    }


def fetch_exchange_candles(symbol: str, interval: str = "5m", days_back: int = 30) -> list[dict]:
    """
    Fetch real market candles for Indian indices & equities.
    Supports NIFTY 50, BANKNIFTY, SENSEX, and NSE stocks.
    """
    sym_map = {
        "INDIA VIX": "^INDIAVIX",
        "NIFTY 50": "^NSEI",
        "NIFTY": "^NSEI",
        "NIFTY FUT": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "NIFTY BANK": "^NSEBANK",
        "SENSEX": "^BSESN",
    }
    clean_sym = symbol.upper().strip()
    target = sym_map.get(clean_sym, clean_sym)
    from app.services.candles import US_SYMBOLS
    if clean_sym not in US_SYMBOLS and not target.startswith("^") and "." not in target:
        target = f"{target}.NS"

    interval_map = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "1h": "60m",
        "1hrs": "60m",
        "4h": "60m",
        "1d": "1d",
        "day": "1d",
    }
    yf_interval = interval_map.get(interval.lower(), "5m")

    # Time window calculation
    if yf_interval == "1m":
        range_str = f"{min(days_back, 7)}d"
    elif yf_interval in ["5m", "15m", "30m"]:
        range_str = f"{min(days_back, 59)}d"
    elif yf_interval == "60m":
        range_str = f"{min(days_back, 729)}d"
    else:
        range_str = f"{days_back}d"

    if yf_interval == "1d" and days_back >= 36525:
        query = urllib.parse.urlencode({"range": "max", "interval": yf_interval})
    elif yf_interval == "1d" and days_back > 365:
        end = datetime.datetime.now(datetime.timezone.utc)
        start = end - datetime.timedelta(days=days_back)
        query = urllib.parse.urlencode({"period1": int(start.timestamp()), "period2": int(end.timestamp()), "interval": yf_interval})
    else:
        query = urllib.parse.urlencode({"range": range_str, "interval": yf_interval})
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(target)}?{query}"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(req, timeout=12) as resp:
        data = json.loads(resp.read().decode())

    chart = data.get("chart", {}).get("result", [])
    if not chart:
        return []

    res = chart[0]
    timestamps = res.get("timestamp", [])
    quotes = res.get("indicators", {}).get("quote", [{}])[0]

    opens = quotes.get("open", [])
    highs = quotes.get("high", [])
    lows = quotes.get("low", [])
    closes = quotes.get("close", [])
    volumes = quotes.get("volume", [])

    ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    candles = []

    for i, ts in enumerate(timestamps):
        if i >= len(opens) or i >= len(closes):
            continue
        o, h, l, c = opens[i], highs[i], lows[i], closes[i]
        if None in (o, h, l, c):
            continue
        dt = datetime.datetime.fromtimestamp(ts, tz=ist_tz)
        v = volumes[i] if (volumes and i < len(volumes) and volumes[i] is not None) else 0
        candles.append({
            "time": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "open": round(float(o), 2),
            "high": round(float(h), 2),
            "low": round(float(l), 2),
            "close": round(float(c), 2),
            "volume": int(v),
        })

    return candles


def fetch_historical_candles(
    symbol: str,
    interval: str = "5m",
    days_back: int = 60,
) -> list[dict]:
    """
    Fetch real OHLCV candles from Zerodha Kite if authenticated,
    otherwise automatically fall back to live real exchange market data for NIFTY/stocks.
    """
    token = get_access_token()
    if token:
        try:
            from kiteconnect import KiteConnect
            instr = NIFTY_INSTRUMENTS.get(symbol.upper().strip())
            if instr:
                kite_interval = KITE_INTERVALS.get(interval.lower(), "5minute")
                kite = KiteConnect(api_key=settings.KITE_API_KEY)
                kite.set_access_token(token)

                now = datetime.datetime.now()
                to_date = now
                from_date = now - datetime.timedelta(days=days_back)

                instrument_token = instr["token"]
                candles_raw = kite.historical_data(
                    instrument_token=instrument_token,
                    from_date=from_date,
                    to_date=to_date,
                    interval=kite_interval,
                    continuous=False,
                    oi=False,
                )

                if candles_raw:
                    return [
                        {
                            "time": str(c["date"]),
                            "open": float(c["open"]),
                            "high": float(c["high"]),
                            "low": float(c["low"]),
                            "close": float(c["close"]),
                            "volume": int(c.get("volume", 0)),
                        }
                        for c in candles_raw
                    ]
        except Exception:
            # Token expired or failed, fall through to real market feed
            pass

    # Real market exchange feed (NIFTY 50, BANKNIFTY, SENSEX, NSE equities)
    candles = fetch_exchange_candles(symbol, interval, days_back)
    if candles:
        return candles

    raise ValueError(f"Could not retrieve real candles for symbol '{symbol}'. Please check symbol name.")


# ─────────────────────────── Indicator calculations ──────────────────────────

def calc_ema(closes: list[float], period: int) -> list[float | None]:
    if len(closes) < period:
        return [None] * len(closes)
    k = 2.0 / (period + 1)
    ema: list[float | None] = [None] * len(closes)
    # Seed with SMA
    ema[period - 1] = sum(closes[:period]) / period
    for i in range(period, len(closes)):
        ema[i] = closes[i] * k + ema[i - 1] * (1 - k)  # type: ignore[operator]
    return ema


def calc_sma(closes: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        result[i] = sum(closes[i - period + 1 : i + 1]) / period
    return result


def calc_rsi(closes: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return result
    gains, losses = [], []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    for i in range(period, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = max(diff, 0)
        loss = max(-diff, 0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        if avg_loss == 0:
            result[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100 - (100 / (1 + rs))
    return result
