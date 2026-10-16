"""Market data feeds.

A Feed produces one-minute bars for every symbol. The engine only depends on
this interface, so a real broker feed (Upstox/Dhan websocket -> minute bars)
can replace SimulatedFeed without touching strategies or risk logic.
"""
import random
import logging
from concurrent.futures import ThreadPoolExecutor
from app.services.candles import IST, US_SYMBOLS, normalize, aggregate, timeframe_minutes
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

PRICE_BOOK: dict[str, float] = {
    "NIFTY 50": 22530.0,
    "NIFTY": 22530.0,
    "NIFTY FUT": 22530.0,
    "BANKNIFTY": 55100.0,
    "BANKNIFTY FUT": 55100.0,
    "FINNIFTY": 24200.0,
    "SENSEX": 73800.0,
    "RELIANCE": 1158.0,
    "TCS": 2245.0,
    "HDFCBANK": 710.0,
    "INFY": 1520.0,
    "ICICIBANK": 1180.0,
    "SBIN": 825.0,
    "TATAMOTORS": 940.0,
    "BHARTIARTL": 1650.0,
    "ITC": 490.0,
    "LT": 3650.0,
    "MARUTI": 12800.0,
    "KOTAKBANK": 1820.0,
    "SUNPHARMA": 1780.0,
    "BAJFINANCE": 6900.0,
    "TITAN": 3450.0,
    "WIPRO": 530.0,
    "TATASTEEL": 160.0,
}
INDEX_SYMBOLS = {"NIFTY 50", "NIFTY", "NIFTY FUT", "BANKNIFTY", "BANKNIFTY FUT", "FINNIFTY", "SENSEX"}
STOCK_SYMBOLS = [s for s in PRICE_BOOK if s not in INDEX_SYMBOLS]

MARKET_OPEN = (9, 15)
MARKET_CLOSE = (15, 30)


@dataclass
class Bar:
    symbol: str
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


@dataclass
class FeedTick:
    """One feed step: the market time and a bar per symbol (None = market closed)."""

    market_time: datetime
    market_open: bool
    new_day: bool
    bars: dict[str, Bar]


class Feed(Protocol):
    kind: str

    def next(self) -> FeedTick: ...


class SimulatedFeed:
    """Compressed trading day: each call advances the virtual clock a few minutes."""

    kind = "simulated"

    def __init__(self, minutes_per_tick: int = 1, pause_ticks: int = 8, seed: int | None = None):
        self.rng = random.Random(seed)
        self.minutes = minutes_per_tick
        self.pause_ticks = pause_ticks
        self.prices = dict(PRICE_BOOK)
        self.day = datetime.now(IST).date()
        self.now = datetime.combine(self.day, datetime.min.time()).replace(
            hour=MARKET_OPEN[0], minute=MARKET_OPEN[1], tzinfo=IST
        )
        self._pause = 0
        self._started = False
        self.vol = 0.0007  # per-minute volatility
        self.history: dict[str, list[Bar]] = {sym: [] for sym in self.prices}

    def _close_dt(self) -> datetime:
        return self.now.replace(hour=MARKET_CLOSE[0], minute=MARKET_CLOSE[1])

    def next(self) -> FeedTick:
        if self._pause > 0:
            self._pause -= 1
            if self._pause == 0:
                self.day = self.day + timedelta(days=1)
                while self.day.weekday() >= 5:
                    self.day = self.day + timedelta(days=1)
                self.now = datetime.combine(self.day, datetime.min.time()).replace(
                    hour=MARKET_OPEN[0], minute=MARKET_OPEN[1], tzinfo=IST
                )
                self._started = False
                return FeedTick(self.now, False, True, {})
            return FeedTick(self._close_dt(), False, False, {})

        bars: dict[str, Bar] = {}
        for _ in range(self.minutes):
            if self._started:
                self.now += timedelta(minutes=1)
            self._started = True
            if self.now > self._close_dt():
                self._pause = self.pause_ticks
                self.now = self._close_dt()
                return FeedTick(self.now, False, False, {})
            
            bar_time = int(self.now.timestamp())
            for sym, last in list(self.prices.items()):
                o = last
                h = lo = c = o
                for _ in range(5):
                    c = max(0.05, c * (1 + self.rng.gauss(0, self.vol)))
                    h = max(h, c)
                    lo = min(lo, c)
                self.prices[sym] = c
                prev = self.history[sym][-1] if self.history[sym] else None
                new_bar = Bar(
                    sym,
                    bar_time,
                    prev.close if prev else round(o, 2),
                    round(max(h, prev.close) if prev else h, 2),
                    round(min(lo, prev.close) if prev else lo, 2),
                    round(c, 2),
                    self.rng.randint(100, 10000),
                )
                bars[sym] = new_bar
                self.history[sym].append(new_bar)
                if len(self.history[sym]) > 100000:
                    del self.history[sym][:-100000]
        return FeedTick(self.now, True, False, bars)


class RealMarketFeed:
    """Background read-only OHLCV polling; no fabricated prices or timestamps.

    Workers only fetch. The engine thread merges results and owns history, keeping
    API commands and websocket updates responsive during provider timeouts.
    """
    kind = "real_market"

    def __init__(self):
        self.prices = {}
        self.history: dict[str, list[Bar]] = {}
        self.symbols = {"NIFTY 50", "BANKNIFTY", "RELIANCE"}
        self.requests = {(s, "1m") for s in self.symbols}
        self.series = {}
        self.candle_cache = {}
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="market-data")
        self.jobs = {}
        self.last_fetch = {}
        self.last_date = ""
        self.errors = {}

    def set_symbols(self, symbols, strategies=()):
        self.symbols = set(symbols) | {"NIFTY 50", "BANKNIFTY", "RELIANCE"}
        self.requests = {(s, "1m") for s in self.symbols}
        for s in strategies:
            if s["status"] not in {"running", "paused"}:
                continue
            tf = timeframe_minutes(s["timeframe"])
            base = self._base(tf)
            from app.services.engine import TradingEngine
            for symbol in TradingEngine._universe(s["instrument"]):
                if s.get("params", {}).get("market") == "US":
                    US_SYMBOLS.add(symbol)
                self.requests.add((symbol, base))

    @staticmethod
    def _base(minutes):
        # Fetch a supported divisor, then aggregate locally for 4h/custom.
        return next((tf for tf, n in [("1h", 60), ("30m", 30), ("15m", 15), ("5m", 5)] if minutes % n == 0), "1m")

    def candles(self, symbol, timeframe, now):
        base = self._base(timeframe_minutes(timeframe))
        bars = self.history.get(symbol, []) if base == "1m" else self.series.get((symbol, base), [])
        key = (symbol, timeframe)
        version = (len(bars), bars[-1].time if bars else 0, int(now.timestamp())//60)
        cached = self.candle_cache.get(key)
        if cached and cached[0] == version:
            return cached[1]
        candles = aggregate(bars, timeframe, now, symbol, timeframe_minutes(base))
        self.candle_cache[key] = (version, candles)
        return candles

    @staticmethod
    def _fetch(symbol, base, warm):
        from app.services.kite_backtest import fetch_historical_candles
        return fetch_historical_candles(symbol, base, days_back=(7 if base == "1m" else 59) if warm else 1)

    def next(self) -> FeedTick:
        now = datetime.now(IST)
        now_ts = now.timestamp()
        new_day = bool(self.last_date and self.last_date != now.date().isoformat())
        self.last_date = now.date().isoformat()
        bars = {}
        for key, job in list(self.jobs.items()):
            sym, base = key
            if not job.done():
                continue
            del self.jobs[key]
            try:
                fetched = [normalize(b) for b in job.result()]
                history = self.history.get(sym, []) if base == "1m" else self.series.get(key, [])
                merged = {b.time: b for b in history}
                for b in fetched:
                    if b["time"] <= now_ts and now_ts - b["time"] < 90*86400:
                        merged[b["time"]] = Bar(sym, b["time"], b["open"], b["high"], b["low"], b["close"], b.get("volume"))
                target = self.history if base == "1m" else self.series
                target[sym if base == "1m" else key] = [merged[t] for t in sorted(merged)][-30000:]
                self.candle_cache = {k: v for k, v in self.candle_cache.items() if k[0] != sym}
                self.errors.pop(sym, None)
            except Exception as exc:
                self.errors[sym] = str(exc)
                logging.getLogger("feed").warning("Market data %s: %s", sym, exc)
        for sym in self.symbols:
            history = self.history.get(sym, [])
            if history:
                b = history[-1]
                # Old candles cannot fill orders, trigger stops, or mark positions.
                if 0 <= now_ts-b.time <= 120:
                    bars[sym] = b
                    self.prices[sym] = b.close
        # Oldest-request-first scheduling prevents a large basket starving symbols.
        for key in sorted(self.requests, key=lambda k: self.last_fetch.get(k, 0)):
            if key not in self.jobs and now_ts-self.last_fetch.get(key, 0) >= 15 and len(self.jobs) < 4:
                self.jobs[key] = self.pool.submit(self._fetch, *key, not (self.history.get(key[0]) if key[1] == "1m" else self.series.get(key)))
                self.last_fetch[key] = now_ts
        from zoneinfo import ZoneInfo
        def session_open(sym):
            local = now.astimezone(ZoneInfo("America/New_York")) if sym in US_SYMBOLS else now
            start, end = ("09:30", "16:00") if sym in US_SYMBOLS else ("09:15", "15:30")
            return local.weekday() < 5 and start <= local.strftime("%H:%M") <= end
        return FeedTick(now, any(session_open(s) for s in self.symbols), new_day, bars)

    def close(self):
        self.pool.shutdown(wait=False, cancel_futures=True)


def build_feed(kind: str = "real_market", minutes_per_tick: int = 1, pause_ticks: int = 8, seed: int | None = None) -> Feed:
    if kind == "simulated":
        return SimulatedFeed(minutes_per_tick, pause_ticks, seed)
    if kind in {"real_market", "broker"}:
        return RealMarketFeed()
    raise ValueError(f"Unsupported market data feed: {kind}")
