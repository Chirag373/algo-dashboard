"""Provider quote ticks must not break completed-candle EMA history."""
import unittest
from datetime import datetime, timedelta
from app.services.candles import aggregate, IST
from app.services.conditions import evaluate


class EmaHistoryTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 15, 9, 15, tzinfo=IST)
        self.now = self.start + timedelta(minutes=125)
        self.bars = [dict(time=int((self.start + timedelta(minutes=i * 5)).timestamp()),
                          open=100 + i, high=101 + i, low=99 + i, close=100 + i, volume=0)
                     for i in range(25)]

    def test_off_interval_quotes_do_not_erase_ema_warmup(self):
        quotes = [{**b, "time": b["time"] + 83, "close": 10000, "high": 10000} for b in self.bars]
        clean = aggregate(self.bars, "5m", self.now, "NIFTY 50", 5)
        mixed = aggregate(list(reversed(self.bars + quotes)), "5m", self.now, "NIFTY 50", 5)
        self.assertEqual(mixed, clean)
        condition = evaluate([dict(indicator="EMA 9", operator="crosses above", value="EMA 21")], mixed).conditions[0]
        self.assertAlmostEqual(condition["left"], 120)
        self.assertAlmostEqual(condition["right"], 114)
        self.assertIsNotNone(condition["previousRight"])

    def test_genuine_missing_candle_still_requires_warmup(self):
        missing = [b for i, b in enumerate(self.bars) if i != 18]
        candles = aggregate(missing, "5m", self.now, "NIFTY 50", 5)
        condition = evaluate([dict(indicator="EMA 9", operator="crosses above", value="EMA 21")], candles).conditions[0]
        self.assertIsNone(condition["left"])
        self.assertIsNone(condition["right"])
