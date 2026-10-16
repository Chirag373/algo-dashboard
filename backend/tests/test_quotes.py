"""Watchlist points must compare sessions, not adjacent ticks."""
import unittest
from unittest.mock import patch
from app.services import quotes
from app.api.routes import get_quote, get_quotes


def candle(time, close):
    return {"time": time, "open": close, "high": close, "low": close, "close": close}


class QuoteTests(unittest.TestCase):
    def setUp(self):
        quotes._cache.clear()
        self.candles = [candle("2026-10-15 15:25:00", 23000),
                        candle("2026-10-16 09:15:00", 23110),
                        candle("2026-10-16 09:19:32", 23125)]

    def test_points_are_previous_session_close_not_previous_tick(self):
        result = quotes.quote_from_candles("NIFTY 50", list(reversed(self.candles)))
        self.assertEqual(result["ltp"], 23125)
        self.assertEqual(result["previousClose"], 23000)
        self.assertEqual(result["chg"], 125)
        self.assertEqual(result["pct"], .54)

    def test_negative_zero_and_unavailable_are_distinct(self):
        result = quotes.quote_from_candles("TCS", [candle("2026-10-15 15:25:00", 100), candle("2026-10-16 09:15:00", 95)])
        self.assertEqual(result["chg"], -5)
        result = quotes.quote_from_candles("TCS", [candle("2026-10-15 15:25:00", 100), candle("2026-10-16 09:15:00", 100)])
        self.assertEqual(result["chg"], 0)
        result = quotes.quote_from_candles("TCS", [candle("2026-10-16 09:15:00", 100)])
        self.assertIsNone(result["chg"])
        self.assertIsNone(result["pct"])

    def test_weekend_uses_last_observed_session(self):
        result = quotes.quote_from_candles("NIFTY 50", [candle("2026-10-09 15:25:00", 100), candle("2026-10-12 09:15:00", 110)])
        self.assertEqual(result["chg"], 10)

    @patch.object(quotes, "fetch_exchange_candles")
    def test_single_and_batch_routes_share_cached_quote(self, fetch):
        fetch.return_value = self.candles
        result = get_quote("nifty 50")
        self.assertTrue(result["ok"])
        self.assertEqual(result["chg"], 125)
        batch = get_quotes("NIFTY 50,NIFTY 50")
        self.assertEqual(batch["quotes"]["NIFTY 50"]["chg"], 125)
        fetch.assert_called_once_with("NIFTY 50", "5m", 7)

    @patch.object(quotes, "fetch_exchange_candles", side_effect=OSError("provider unavailable"))
    def test_provider_failure_does_not_invent_zero_movement(self, fetch):
        result = get_quote("NIFTY 50")
        self.assertFalse(result["ok"])
        self.assertIsNone(result["chg"])
        batch = get_quotes("NIFTY 50")
        self.assertIsNone(batch["quotes"]["NIFTY 50"]["chg"])
