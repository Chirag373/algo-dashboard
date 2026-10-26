"""OHLCV aggregation for chart intervals beyond provider-native candles."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from app.services.candles import US_SYMBOLS


def aggregate_chart(candles, timeframe, symbol):
    if timeframe not in {"4h", "1M", "1Y", "5Y"}:
        return candles
    us = symbol.upper() in US_SYMBOLS
    tz = ZoneInfo("America/New_York" if us else "Asia/Kolkata")
    groups = {}
    for candle in candles:
        value = candle["time"]
        if isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(value, tz)
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            dt = dt.replace(tzinfo=tz) if dt.tzinfo is None else dt.astimezone(tz)
        if timeframe == "4h":
            opening = dt.replace(hour=9, minute=30 if us else 15, second=0, microsecond=0)
            bucket = int((dt - opening).total_seconds() // (4 * 3600))
            if bucket < 0:
                continue
            start = opening + timedelta(hours=4 * bucket)
        elif timeframe == "1M":
            start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            year = dt.year if timeframe == "1Y" else dt.year - dt.year % 5
            start = dt.replace(year=year, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        groups.setdefault(start, []).append((dt, candle))
    result = []
    for start, items in sorted(groups.items()):
        bars = [item[1] for item in sorted(items, key=lambda item: item[0])]
        result.append(dict(time=start.isoformat(), open=bars[0]["open"],
                           high=max(b["high"] for b in bars), low=min(b["low"] for b in bars),
                           close=bars[-1]["close"], volume=sum(b.get("volume") or 0 for b in bars)))
    return result
