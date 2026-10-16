"""Validate and aggregate actual minute candles, never synthesize missing data."""
import math
import re
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
US_SYMBOLS = {"SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META"}


def timeframe_minutes(value: str) -> int:
    match = re.fullmatch(r"([1-9][0-9]*)(m|h)", value.strip())
    if not match:
        raise ValueError("Timeframe must be minutes or hours, e.g. 7m or 4h")
    minutes = int(match[1]) * (60 if match[2] == "h" else 1)
    if minutes > 1440:
        raise ValueError("Timeframe cannot exceed 1440 minutes")
    return minutes


def timestamp(value) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return int(dt.timestamp())


def normalize(raw) -> dict:
    b = asdict(raw) if is_dataclass(raw) else dict(raw)
    b["time"] = timestamp(b["time"])
    for key in ("open", "high", "low", "close"):
        b[key] = float(b[key])
        if not math.isfinite(b[key]) or b[key] <= 0:
            raise ValueError("Invalid OHLC candle")
    if b["low"] > min(b["open"], b["close"]) or b["high"] < max(b["open"], b["close"]):
        raise ValueError("Inconsistent OHLC candle")
    if b.get("volume") is not None:
        b["volume"] = float(b["volume"])
        if not math.isfinite(b["volume"]) or b["volume"] < 0:
            raise ValueError("Invalid candle volume")
    return b


def aggregate(raw_bars, timeframe: str, now: datetime, symbol: str, source_minutes: int = 1, keep_segments: bool = False, market: str | None = None) -> list[dict]:
    minutes = timeframe_minutes(timeframe)
    if minutes % source_minutes:
        raise ValueError("Source interval must divide the selected timeframe")
    is_us = market == "US" or symbol in US_SYMBOLS
    tz = ZoneInfo("America/New_York") if is_us else IST
    opening = (9, 30) if is_us else (9, 15)
    groups: dict[int, list[dict]] = {}
    unique = {b["time"]: b for b in (normalize(raw) for raw in raw_bars)}
    ends = {}
    for ts, b in sorted(unique.items()):
        dt = datetime.fromtimestamp(ts, tz)
        start = dt.replace(hour=opening[0], minute=opening[1], second=0, microsecond=0)
        close = dt.replace(hour=16 if is_us else 15, minute=0 if is_us else 30, second=0, microsecond=0)
        if dt < start or dt >= close or dt.weekday() >= 5:
            continue
        # Some providers append a current quote stamped at an arbitrary second.
        # It is not an interval candle and must not invalidate a genuine bucket.
        if (ts - int(start.timestamp())) % (source_minutes * 60):
            continue
        if min(ts+source_minutes*60, close.timestamp()) > now.timestamp():
            continue
        bucket = int(start.timestamp()) + int((ts-start.timestamp())//(minutes*60))*minutes*60
        ends[bucket] = min(bucket+minutes*60, int(close.timestamp()))
        groups.setdefault(bucket, []).append(b)
    out = []
    for start, bars in groups.items():
        end = ends[start]
        expected = list(range(start, end, source_minutes*60))
        if [b["time"] for b in bars] != expected or end > now.timestamp():
            continue
        dt = datetime.fromtimestamp(start, tz)
        out.append({"time": start, "end": end, "open": bars[0]["open"], "high": max(b["high"] for b in bars), "low": min(b["low"] for b in bars), "close": bars[-1]["close"], "volume": sum(b["volume"] for b in bars) if all(b.get("volume") is not None for b in bars) else None, "session": dt.date().isoformat(), "sessionFirst": (dt.hour, dt.minute) == opening})
    # An intraday data gap breaks the calculation window. Never treat a missing
    # candle as if the surrounding candles were consecutive for a crossover.
    cut = 0
    segment = 0
    if out:
        out[0]["segment"] = segment
    for i in range(1, len(out)):
        if out[i]["session"] == out[i-1]["session"] and out[i]["time"] != out[i-1]["end"]:
            cut = i
            segment += 1
        out[i]["segment"] = segment
    return out if keep_segments else out[cut:]
