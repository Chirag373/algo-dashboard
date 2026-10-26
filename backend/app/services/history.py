"""Date-bounded, read-only history adapters. Never substitute generated data.

Kite REST contract: https://kite.trade/docs/connect/v3/historical/
Instrument master: https://kite.trade/docs/connect/v3/market-quotes/
"""
import csv
import gzip
import io
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.candles import IST, US_SYMBOLS, normalize, timeframe_minutes
from app.services.kite_backtest import get_access_token, NIFTY_INSTRUMENTS


class HistoryError(ValueError):
    pass


class InstrumentUnavailable(HistoryError):
    """The requested instrument has no records at this provider; not an auth error."""


@dataclass
class HistoricalData:
    candles: list[dict]
    source: str
    source_minutes: int
    warnings: list[str] = field(default_factory=list)


def market_timezone(symbol: str, market: str = "IN"):
    return ZoneInfo("America/New_York") if market == "US" or symbol in US_SYMBOLS else IST


def source_interval(minutes: int) -> tuple[str, int]:
    return next(((tf,n) for tf,n in [("1h",60),("30m",30),("15m",15),("5m",5)] if minutes % n == 0), ("1m",1))


_KITE_LOCK = threading.Lock()
_KITE_LAST = 0.0
_INSTRUMENT_CACHE: dict = {}


def _request(url: str, headers=None, kite=False) -> bytes:
    global _KITE_LAST
    if kite:
        with _KITE_LOCK:
            wait = .4-(time.monotonic()-_KITE_LAST)
            if wait > 0:
                time.sleep(wait)
            _KITE_LAST = time.monotonic()
    request = urllib.request.Request(url, headers=headers or {"User-Agent":"Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read()
            return gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise InstrumentUnavailable("Historical instrument or endpoint was not found (HTTP 404).") from None
        raise HistoryError(f"Historical provider returned HTTP {exc.code}. Check authentication, data permissions and the requested range.") from None
    except (OSError, TimeoutError) as exc:
        raise HistoryError(f"Historical provider is unavailable: {exc}") from None


def _kite_token(symbol, headers):
    if symbol.startswith("CDS:"):
        parts = symbol.split(":")
        if len(parts) != 3 or not parts[1].startswith("USDINR") or not parts[1].endswith("FUT") or not parts[2].isdigit():
            raise HistoryError("Invalid saved USDINR reference contract.")
        return int(parts[2])
    if symbol in NIFTY_INSTRUMENTS and "FUT" not in symbol:
        return NIFTY_INSTRUMENTS[symbol]["token"]
    if symbol.endswith(" FUT"):
        raise HistoryError("Select an exact futures contract; an index price cannot substitute for a futures instrument.")
    exchange = "BSE" if symbol == "SENSEX" or symbol.endswith(".BO") else "NSE"
    lookup_symbol = symbol[:-3] if symbol.endswith(".BO") else symbol
    today = datetime.now(IST).date().isoformat()
    key = (exchange, today)
    if key not in _INSTRUMENT_CACHE:
        body = _request(f"https://api.kite.trade/instruments/{exchange}", headers, kite=True)
        rows = csv.DictReader(io.StringIO(body.decode()))
        _INSTRUMENT_CACHE[key] = {r["tradingsymbol"]: int(r["instrument_token"]) for r in rows}
    aliases = {"FINNIFTY":"NIFTY FIN SERVICE", "BANKNIFTY":"NIFTY BANK", "NIFTY":"NIFTY 50"}
    token = _INSTRUMENT_CACHE[key].get(aliases.get(lookup_symbol,lookup_symbol))
    if token is None:
        raise InstrumentUnavailable(f"Kite instrument master does not contain {exchange}:{symbol}. No substitute instrument was used.")
    return token


def _clean(candles, start, end) -> list[dict]:
    unique = {}
    for raw in candles:
        try:
            bar = normalize(raw)
        except (ValueError, TypeError, KeyError) as exc:
            raise HistoryError(f"Provider returned an invalid candle: {exc}") from None
        if start.timestamp() <= bar["time"] < end.timestamp():
            unique[bar["time"]] = bar
    return [unique[t] for t in sorted(unique)]


def fetch_history(symbol: str, timeframe: str, start: datetime, end: datetime,
                  warmup_start: datetime, market="IN", token: str | None = None) -> HistoricalData:
    token = get_access_token() if token is None else token
    minutes = timeframe_minutes(timeframe)
    if token and market != "US" and symbol not in US_SYMBOLS:
        headers = {"X-Kite-Version":"3", "Authorization":f"token {settings.KITE_API_KEY}:{token}"}
        instrument = _kite_token(symbol, headers)
        candles = []
        cursor = warmup_start
        while cursor < end:
            stop = min(cursor+timedelta(days=30),end)
            query = urllib.parse.urlencode({"from":cursor.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S"),
                "to":(stop-timedelta(seconds=1)).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S"), "continuous":0,"oi":0})
            raw = json.loads(_request(f"https://api.kite.trade/instruments/historical/{instrument}/minute?{query}",headers,kite=True))
            if raw.get("status") != "success":
                raise HistoryError(f"Kite historical data error: {raw.get('message','Unknown provider error')}")
            candles.extend(dict(time=b[0],open=b[1],high=b[2],low=b[3],close=b[4],volume=b[5]) for b in raw.get("data",{}).get("candles",[]))
            cursor = stop
        return HistoricalData(_clean(candles,warmup_start,end),"Zerodha Kite Connect",1)

    if symbol.startswith("CDS:"):
        raise HistoryError("Connect Zerodha to load the saved USDINR futures history. No spot or substitute contract was used.")

    # Explicit public-provider fallback; its intraday retention is never extended
    # using generated candles or silently changing the requested timeframe.
    interval, base = source_interval(minutes)
    limit_days = 7 if base == 1 else (59 if base < 60 else 729)
    oldest = datetime.now(end.tzinfo)-timedelta(days=limit_days)
    if start < oldest:
        raise HistoryError(f"Yahoo Finance cannot provide the requested {timeframe} range ({limit_days}-day retention at {interval}). Connect Kite with historical-data access for this period.")
    warnings = []
    if warmup_start < oldest:
        warmup_start = oldest
        warnings.append("Provider retention limited warmup history; conditions remain unavailable until sufficiently warmed up.")
    mapping = {"INDIA VIX":"^INDIAVIX","NIFTY":"^NSEI","NIFTY 50":"^NSEI","BANKNIFTY":"^NSEBANK","NIFTY BANK":"^NSEBANK","SENSEX":"^BSESN"}
    target = mapping.get(symbol,symbol)
    if symbol.endswith(" FUT"):
        raise HistoryError("Select an exact contract and connect its historical provider. Index candles cannot substitute for futures.")
    if not target.startswith("^") and "." not in target and market != "US" and symbol not in US_SYMBOLS:
        target += ".NS"
    query = urllib.parse.urlencode({"period1":int(warmup_start.timestamp()),"period2":int(end.timestamp()),"interval":"60m" if base == 60 else interval})
    try:
        raw = json.loads(_request(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(target)}?{query}"))
    except InstrumentUnavailable:
        raise InstrumentUnavailable(f"Yahoo Finance has no historical listing for {symbol} ({target}, HTTP 404). The symbol may be unavailable or have changed. No substitute instrument was used.") from None
    chart = raw.get("chart",{})
    if chart.get("error") or not chart.get("result"):
        raise InstrumentUnavailable(f"Yahoo Finance has no historical data for {symbol} ({target}) in this range. No substitute instrument was used.")
    result = chart["result"][0]
    q = result.get("indicators",{}).get("quote",[{}])[0]
    candles = []
    rejected = 0
    for i,ts in enumerate(result.get("timestamp",[])):
        fields = {key:q.get(key,[])[i] if i < len(q.get(key,[])) else None for key in ["open","high","low","close","volume"]}
        if any(fields[k] is None for k in ["open","high","low","close"]):
            rejected += 1
            continue
        candles.append({"time":ts,**fields})
    if rejected:
        warnings.append(f"{rejected} null OHLC records were excluded; no prices were filled in.")
    return HistoricalData(_clean(candles,warmup_start,end),"Yahoo Finance historical data",base,warnings)
