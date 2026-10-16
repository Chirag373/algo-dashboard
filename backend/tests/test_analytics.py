"""Persisted analytics, filtering and metric edge cases; no broker calls."""
import asyncio
import json
import unittest
from urllib.parse import urlencode
from app.services.analytics import performance
from tests import test_execution_api as api_fixture


def trade(i, pnl, day="2026-10-15", sid="s1"):
    return dict(id=str(i), pnl=pnl, fees=2, tradeDate=day, strategyId=sid, closedAt="10:00:00")


class PerformanceTests(unittest.TestCase):
    def test_trade_profit_factor_drawdown_and_net_fees(self):
        result = performance([trade(1, 100), trade(2, -50), trade(3, -150, "2026-10-16")], 1000)
        m = result["metrics"]
        self.assertEqual(m["totalPnl"], -100)
        self.assertEqual(m["profitFactor"], .5)
        self.assertEqual(m["fees"], 6)
        self.assertEqual(m["maxDrawdownAmount"], 200)
        self.assertAlmostEqual(m["maxDrawdown"], 200 / 1100 * 100)
        self.assertEqual(m["avgWin"], 50)
        self.assertEqual(m["avgLoss"], -150)
        self.assertIsNotNone(m["sharpe"])
        self.assertEqual(result["days"][-1]["equity"], 900)
        self.assertEqual(result["days"][-1]["drawdown"], -150)

    def test_empty_and_undefined_metrics_are_json_safe(self):
        for rows in [[], [trade(1, 0)], [trade(1, 10)]]:
            m = performance(rows, 0)["metrics"]
            json.dumps(m, allow_nan=False)
            self.assertIsNone(m["sharpe"])
            self.assertIsNone(m["returnPct"])
            self.assertIsNone(m["maxDrawdown"])
        self.assertTrue(performance([trade(1, 10)], 1000)["metrics"]["profitFactorInfinite"])
        self.assertIsNone(performance([], 1000)["metrics"]["winRate"])

    def test_best_and_worst_days_are_not_clamped(self):
        loss = performance([trade(1, -10), trade(2, -20, "2026-10-16")], 1000)
        self.assertEqual(loss["metrics"]["bestDay"], -10)
        win = performance([trade(1, 10), trade(2, 20, "2026-10-16")], 1000)
        self.assertEqual(win["metrics"]["worstDay"], 10)


class AnalyticsApiTests(unittest.TestCase):
    def setUp(self):
        api_fixture.ExecutionApiTests.setUp(self)
        for i in range(205):
            t = trade(i, 10 if i % 2 == 0 else -5)
            self.engine.db.add_trade(t, t["tradeDate"], i)
        self.engine.db.add_trade(trade("manual", 7, sid="manual"), "2026-10-15", 206)
        self.engine.db.add_trade(trade("next", -30, "2026-10-16", "removed"), "2026-10-16", 207)

    def request(self, **params):
        messages = []
        async def receive(): return {"type": "http.request", "body": b"", "more_body": False}
        async def send(message): messages.append(message)
        scope = dict(type="http", asgi={"version": "3.0"}, http_version="1.1", method="GET", scheme="http", path="/api/v1/analytics", raw_path=b"/api/v1/analytics", query_string=urlencode(params).encode(), root_path="", headers=[], client=("127.0.0.1", 1234), server=("test", 80))
        asyncio.run(self.app(scope, receive, send))
        status = next(m["status"] for m in messages if m["type"] == "http.response.start")
        return status, json.loads(b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body"))

    def test_full_history_totals_and_read_only(self):
        code, result = self.request(date_to="2026-10-16")
        self.assertEqual(code, 200)
        self.assertEqual(result["totalTrades"], 207)
        self.assertEqual(result["metrics"]["totalPnl"], 497)
        self.assertEqual(len(result["trades"]), 25)
        self.assertEqual(result["totalPages"], 9)
        self.assertEqual(result["trades"][0]["id"], "next")
        self.assertTrue({"manual", "removed", "s1"} <= {s["id"] for s in result["strategies"]})
        self.assertFalse(self.engine.positions)
        self.assertFalse(self.engine.db.recent_orders())

    def test_filters_and_pagination(self):
        _, result = self.request(strategy_id="s1", date_from="2026-10-15", date_to="2026-10-15", page=9)
        self.assertEqual(result["totalTrades"], 205)
        self.assertEqual(result["metrics"]["totalPnl"], 520)
        self.assertEqual(len(result["trades"]), 5)
        self.assertEqual(len(result["days"]), 1)
        _, result = self.request(strategy_id="removed", date_from="2026-10-16", date_to="2026-10-16")
        self.assertEqual(result["metrics"]["totalPnl"], -30)
        self.assertEqual(result["trades"][0]["strategyName"], "Removed strategy")
        _, result = self.request(strategy_id="missing", date_to="2026-10-16")
        self.assertEqual(result["totalTrades"], 0)
        self.assertEqual(result["days"], [])

    def test_validation(self):
        for query in [dict(date_from="2026-10-20", date_to="2026-10-15"), dict(date_from="bad"), dict(page=0), dict(page_size=1000)]:
            self.assertEqual(self.request(**query)[0], 422)
