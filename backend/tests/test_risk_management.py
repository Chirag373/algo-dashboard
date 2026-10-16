"""Saved risk settings must persist and govern real execution paths."""
import math
import unittest
from datetime import timedelta
from unittest.mock import patch
from pydantic import ValidationError
from app.schemas import RiskIn, OrderIn
from app.services.engine import EngineError, TradingEngine
from app.services.feed import FeedTick
from app.services.broker import PaperBroker
from tests.test_execution import setup, payload, rule
from tests import test_execution_api as api_fixture


class RiskTests(unittest.TestCase):
    def setUp(self):
        self.e, self.t = setup()
        self.e.on_tick(self.t.tick(100))

    def limits(self, **changes):
        return RiskIn(**{**self.e.risk, "totalCapital": 1000, "maxCapitalPerTrade": 1000,
                        "maxDailyLoss": 500, **changes})

    def test_trade_counter_counts_entries_not_exits_and_survives_restart(self):
        self.e.update_risk(self.limits(maxTradesPerDay=1))
        self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))
        self.assertEqual(self.e.risk_status()["entriesToday"], 1)
        self.e.close_position(self.e.positions[0]["id"])
        self.assertEqual(self.e.risk_status()["entriesToday"], 1)
        with self.assertRaisesRegex(EngineError, "Max trades per day"):
            self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))
        restored = TradingEngine(self.e.db, self.t, PaperBroker(0))
        self.assertEqual(restored.risk["maxTradesPerDay"], 1)
        self.assertEqual(restored.risk_status()["entriesToday"], 1)
        next_day = self.t.now + timedelta(days=1)
        restored.on_tick(FeedTick(next_day, True, True, {}))
        self.assertEqual(restored.risk_status()["entriesToday"], 0)

    def test_pending_orders_recheck_entry_limit_at_fill(self):
        self.e.update_risk(self.limits(maxTradesPerDay=1))
        self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1, type="LIMIT", price=99))
        self.assertEqual(self.e.risk_status()["entriesToday"], 0)
        self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))
        self.e.on_tick(self.t.tick(99))
        self.assertEqual(self.e.risk_status()["entriesToday"], 1)
        self.assertTrue(any(o["status"] == "REJECTED" and "Max trades per day" in o["note"] for o in self.e.db.recent_orders()))

    def test_initial_stop_risk_rejects_oversized_order(self):
        self.e.update_risk(self.limits(riskPerTradePct=1))
        with self.assertRaisesRegex(EngineError, "stop-loss risk"):
            self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=10))
        self.assertEqual(self.e.risk_status()["entriesToday"], 0)
        self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))
        self.assertEqual(len(self.e.positions), 1)

    def test_custom_strategy_uses_its_saved_stop_for_risk_budget(self):
        self.e.update_risk(self.limits(riskPerTradePct=1))
        self.e.create_strategy(payload([rule(right="0")], params={"quantity": 7, "stopLossPercent": 10, "targetPercent": 20, "squareOffTime": "15:15"}))
        self.e.on_tick(self.t.tick(101))
        self.assertFalse(self.e.positions)
        self.assertEqual(self.e.risk_status()["entriesToday"], 0)
        self.assertTrue(any("stop-loss risk" in o.get("note", "") for o in self.e.db.recent_orders()))

    def test_daily_drawdown_closes_positions_and_latches_kill(self):
        self.e.update_risk(self.limits(maxDrawdownPct=.5))
        self.e._open_position("TCS", "BUY", 1, 100, "manual", "test", sl_pct=90, target_pct=100)
        self.e.on_tick(self.t.tick(90))
        self.assertTrue(self.e.killed)
        self.assertFalse(self.e.positions)
        self.assertEqual(self.e.db.recent_trades()[0]["reason"], "Daily drawdown limit hit")
        self.assertGreaterEqual(self.e.risk_status()["drawdownPct"], .5)
        self.e.set_kill(False)
        with self.assertRaisesRegex(EngineError, "drawdown limit"):
            self.e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))

    def test_strategy_limits_are_additional_and_do_not_block_other_strategy(self):
        s = self.e.create_strategy(payload(name="one", rules=[rule(right="1000")]))
        other = self.e.create_strategy(payload(name="two", rules=[rule(right="1000")]))
        self.e.update_risk(self.limits(strategyLimits={s["id"]: {"maxDailyLoss": 5, "maxOpenPositions": 1}}))
        self.e._open_position("TCS", "BUY", 1, 100, s["id"], "test", sl_pct=90, target_pct=100)
        self.assertIn("Strategy max open positions", self.e._risk_reject_reason("TCS", 1, 100, strategy_id=s["id"]))
        self.e.on_tick(self.t.tick(90))
        self.assertFalse(self.e.positions)
        self.assertFalse(self.e.killed)
        self.assertTrue(self.e.risk_status()["strategies"][s["id"]]["blocked"])
        self.assertIn("Strategy daily loss", self.e._risk_reject_reason("TCS", 1, 90, strategy_id=s["id"]))
        self.assertIsNone(self.e._risk_reject_reason("TCS", 1, 90, strategy_id=other["id"]))

    def test_rollback_restores_risk_counters(self):
        before = self.e.risk_status()["entriesToday"]
        with self.assertRaises(RuntimeError):
            with self.e.atomic():
                self.e._open_position("TCS", "BUY", 1, 100, "manual", "test")
                raise RuntimeError("rollback")
        self.assertEqual(self.e.risk_status()["entriesToday"], before)
        self.assertFalse(self.e.positions)

    def test_validation_and_unknown_strategy_do_not_save(self):
        for fields in [dict(riskPerTradePct=math.inf), dict(maxDrawdownPct=101), dict(maxTradesPerDay=1.5), dict(strategyLimits={"s": {"maxDailyLoss": -1}})]:
            with self.assertRaises(ValidationError):
                self.limits(**fields)
        before = dict(self.e.risk)
        with self.assertRaises(EngineError):
            self.e.update_risk(self.limits(strategyLimits={"deleted": {"maxDailyLoss": 5}}))
        self.assertEqual(self.e.risk, before)


class RiskApiTests(unittest.TestCase):
    def setUp(self):
        api_fixture.ExecutionApiTests.setUp(self)

    def request(self, *args):
        return api_fixture.ExecutionApiTests.request(self, *args)

    def test_save_route_returns_saved_limits_and_persists(self):
        body = {**self.engine.risk, "riskPerTradePct": 2, "maxDrawdownPct": 3, "maxTradesPerDay": 8}
        code, result = self.request("PUT", "/api/v1/risk", body)
        self.assertEqual(code, 200)
        self.assertEqual(result["state"]["risk"]["maxTradesPerDay"], 8)
        restored = TradingEngine(self.engine.db, self.tape, PaperBroker(0))
        self.assertEqual(restored.risk["riskPerTradePct"], 2)
        self.assertEqual(restored.risk["maxDrawdownPct"], 3)
        self.assertIn("riskStatus", result["state"])
        code, _ = self.request("PUT", "/api/v1/risk", {**body, "maxTradesPerDay": -1})
        self.assertEqual(code, 422)
        self.assertEqual(self.engine.risk["maxTradesPerDay"], 8)
