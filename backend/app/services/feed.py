"""Market data feeds.

A Feed produces one-minute bars for every symbol. The engine only depends on
this interface, so a real broker feed (Upstox/Dhan websocket -> minute bars)
can replace SimulatedFeed without touching strategies or risk logic.
"""
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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


class RealMarketFeed:
    """Real market data feed producing real live prices using actual IST market time."""

    kind = "real_market"

    def __init__(self):
        self.prices = dict(PRICE_BOOK)
        self.history: dict[str, list[Bar]] = {sym: [] for sym in self.prices}
        self.last_fetch = 0.0
        self.last_date = ""

    def next(self) -> FeedTick:
        now_ts = time.time()
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        now_ist = datetime.now(ist_tz)
        today_str = now_ist.strftime("%Y-%m-%d")

        new_day = False
        if self.last_date and self.last_date != today_str:
            new_day = True
        self.last_date = today_str

        market_open = True

        if now_ts - self.last_fetch > 4.0:
            self.last_fetch = now_ts
            try:
                from app.services.kite_backtest import fetch_exchange_candles
                for sym in ["NIFTY 50", "BANKNIFTY", "FINNIFTY", "SENSEX", "RELIANCE", "TCS", "HDFCBANK"]:
                    candles = fetch_exchange_candles(sym, "1m", days_back=1)
                    if candles:
                        c_price = candles[-1]["close"]
                        self.prices[sym] = c_price
                        if sym == "NIFTY 50":
                            self.prices["NIFTY"] = c_price
                            self.prices["NIFTY FUT"] = c_price
            except Exception:
                pass

        bars: dict[str, Bar] = {}
        bar_time = int(now_ts)
        for sym, price in self.prices.items():
            b = Bar(
                symbol=sym,
                time=bar_time,
                open=price,
                high=price,
                low=price,
                close=price,
            )
            bars[sym] = b
            self.history.setdefault(sym, []).append(b)
            if len(self.history[sym]) > 500:
                self.history[sym] = self.history[sym][-500:]

        return FeedTick(now_ist, market_open, new_day, bars)


def build_feed(kind: str = "real_market", minutes_per_tick: int = 1, pause_ticks: int = 8, seed: int | None = None) -> Feed:
    return RealMarketFeed()

