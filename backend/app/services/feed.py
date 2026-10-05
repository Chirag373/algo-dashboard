"""Market data feeds.

A Feed produces one-minute bars for every symbol. The engine only depends on
this interface, so a real broker feed (Upstox/Dhan websocket -> minute bars)
can replace SimulatedFeed without touching strategies or risk logic.
"""
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

PRICE_BOOK: dict[str, float] = {
    "NIFTY FUT": 24510.0,
    "BANKNIFTY FUT": 52340.0,
    "RELIANCE": 2935.0,
    "TCS": 4120.0,
    "INFY": 1865.0,
    "HDFCBANK": 1710.0,
    "SBIN": 825.0,
}
INDEX_SYMBOLS = {"NIFTY FUT", "BANKNIFTY FUT"}
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
        self.day = datetime.now(timezone.utc).date()
        self.now = datetime.combine(self.day, datetime.min.time()).replace(
            hour=MARKET_OPEN[0], minute=MARKET_OPEN[1]
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
                    hour=MARKET_OPEN[0], minute=MARKET_OPEN[1]
                )
                self._started = False
                self.history = {sym: [] for sym in self.prices}
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
                )
                bars[sym] = new_bar
                self.history[sym].append(new_bar)
        return FeedTick(self.now, True, False, bars)


def build_feed(kind: str, minutes_per_tick: int, pause_ticks: int, seed: int | None) -> Feed:
    if kind == "simulated":
        return SimulatedFeed(minutes_per_tick, pause_ticks, seed)
    raise ValueError(f"Unsupported FEED '{kind}'. Only 'simulated' is implemented.")
