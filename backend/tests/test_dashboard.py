"""Dashboard totals and genuine NIFTY chart history."""
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta
from app.db.database import Database
from app.services import market_chart


class DashboardTests(unittest.TestCase):
    def test_totals_include_older_trades_and_split_days(self):
        db = Database(":memory:")
        for i in range(205):
            db.add_trade({"id": str(i), "strategyId": "s1", "pnl": 10 if i % 2 == 0 else -5},
                         "2026-10-15" if i < 200 else "2026-10-16", i)
        db.add_trade({"id": "manual", "strategyId": "", "pnl": -3}, "2026-10-16", 206)
        stats = db.strategy_stats("2026-10-16")
        self.assertEqual(stats["s1"], {"trades": 205, "wins": 103, "realizedPnl": 520, "dayRealizedPnl": 20})
        self.assertEqual(stats[""]["realizedPnl"], -3)
        self.assertEqual(len(db.recent_trades(200)), 200)
        self.assertEqual(db.recent_trades(1)[0]["tradeDate"], "2026-10-16")
        db.conn.close()

    def setUp(self):
        market_chart._cache.clear()
        yesterday = datetime.now(market_chart.IST).date() - timedelta(days=1)
        def bar(date, time, close):
            return {"time": f"{date} {time}", "open": close, "high": close + 1, "low": close - 1, "close": close}
        self.raw = [bar(yesterday - timedelta(days=1), "15:25:00", 100),
                    bar(yesterday, "09:15:00", 101), bar(yesterday, "09:20:00", 105)]

    @patch.object(market_chart, "fetch_exchange_candles")
    def test_one_day_is_latest_session_and_previous_close(self, fetch):
        fetch.return_value = list(reversed(self.raw)) + [self.raw[-1], {**self.raw[0], "close": float("nan")}]
        result = market_chart.nifty_chart("1D")
        self.assertEqual(len(result["data"]), 2)
        self.assertEqual(result["lastPrice"], 105)
        self.assertEqual(result["change"], 5)
        self.assertEqual(result["changePct"], 5)
        self.assertEqual(result["changeLabel"], "vs previous session close")
        self.assertLess(result["data"][0]["time"], result["data"][1]["time"])
        self.assertEqual(market_chart.nifty_chart("1D"), result)
        fetch.assert_called_once_with("NIFTY 50", "5m", 7)

    @patch.object(market_chart, "fetch_exchange_candles")
    def test_periods_use_separate_intervals_and_do_not_mix_cache(self, fetch):
        fetch.return_value = self.raw
        for period, interval in [("1W", "15m"), ("1M", "1h"), ("3M", "1d")]:
            result = market_chart.nifty_chart(period)
            self.assertEqual(result["interval"], interval)
            self.assertEqual(len(result["data"]), 3)
            self.assertEqual(result["changeLabel"], "over displayed period")
        self.assertEqual(fetch.call_count, 3)

    @patch.object(market_chart, "fetch_exchange_candles", return_value=[])
    def test_missing_data_fails_without_invented_prices(self, fetch):
        with self.assertRaises(ValueError):
            market_chart.nifty_chart("1D")
        self.assertFalse(market_chart._cache)


class DashboardApiTests(unittest.TestCase):
    def setUp(self):
        from tests.test_execution_api import ExecutionApiTests
        ExecutionApiTests.setUp(self)

    def request(self, *args):
        from tests.test_execution_api import ExecutionApiTests
        return ExecutionApiTests.request(self, *args)

    @patch.object(market_chart, "fetch_exchange_candles", return_value=[])
    def test_chart_provider_failure_returns_actionable_error(self, fetch):
        market_chart._cache.clear()
        code, result = self.request("GET", "/api/v1/market/nifty")
        self.assertEqual(code, 503)
        self.assertIn("unavailable", result["detail"])

    def test_snapshot_includes_dashboard_totals(self):
        self.engine.db.add_trade({"id": "one", "strategyId": "s1", "pnl": 10}, self.engine.market_date, 1)
        code, result = self.request("GET", "/api/v1/state")
        self.assertEqual(code, 200)
        self.assertEqual(result["strategyStats"]["s1"]["dayRealizedPnl"], 10)
        self.assertEqual(result["closed"][0]["tradeDate"], self.engine.market_date)
