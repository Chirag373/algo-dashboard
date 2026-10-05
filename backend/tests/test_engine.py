import unittest

from app.db import Database
from app.schemas import OrderIn, RiskIn, StrategyIn
from app.services.broker import PaperBroker
from app.services.engine import EngineError, TradingEngine
from app.services.feed import SimulatedFeed


def make_engine(seed=1, db=None):
    db = db or Database(":memory:")
    feed = SimulatedFeed(minutes_per_tick=1, pause_ticks=2, seed=seed)
    return TradingEngine(db, feed, PaperBroker(20.0)), db


def step(engine, n=1):
    for _ in range(n):
        engine.on_tick(engine.feed.next())


def orb_payload(**over):
    params = {
        "initialSlPercent": 1, "tslLockPercent": 0.5, "tslTrailStep": 0.25,
        "perTradeAmount": 20000, "rangeCandleCount": 3, "maxTradesPerStock": 2,
        "squareOffTime": "15:15",
    }
    params.update(over)
    return StrategyIn(name="t", template="ORB", instrument="NIFTY 50 Stocks",
                      timeframe="1m", params=params)


class EngineTests(unittest.TestCase):
    def test_orders_rejected_when_market_closed(self):
        e, _ = make_engine()
        with self.assertRaises(EngineError) as c:
            e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))
        self.assertIn("closed", c.exception.message)

    def test_market_order_fills_and_exit_computes_net_pnl(self):
        e, _ = make_engine()
        step(e)
        e.place_order(OrderIn(symbol="TCS", side="BUY", qty=10))
        self.assertEqual(len(e.positions), 1)
        pos = e.positions[0]
        e.prices["TCS"] = pos["avg"] + 10
        e.close_position(pos["id"])
        trade = e.db.recent_trades(1)[0]
        self.assertAlmostEqual(trade["pnl"], 10 * 10 - 40, places=2)  # gross 100 - 2 fees
        self.assertAlmostEqual(e.realized_today, trade["pnl"], places=2)

    def test_risk_limits(self):
        e, _ = make_engine()
        step(e)
        e.update_risk(RiskIn(maxDailyLoss=5000, maxOpenPositions=1, maxCapitalPerTrade=50000,
                             totalCapital=100000, autoSquareOffTime="15:19"))
        e.place_order(OrderIn(symbol="SBIN", side="BUY", qty=1))
        with self.assertRaises(EngineError):  # max positions
            e.place_order(OrderIn(symbol="SBIN", side="BUY", qty=1))
        e.square_off_all()
        with self.assertRaises(EngineError):  # capital per trade
            e.place_order(OrderIn(symbol="TCS", side="BUY", qty=100))
        rejected = [o for o in e.db.recent_orders() if o["status"] == "REJECTED"]
        self.assertEqual(len(rejected), 2)

    def test_kill_switch_blocks_orders_and_strategy_start(self):
        e, _ = make_engine()
        step(e)
        e.set_kill(True)
        with self.assertRaises(EngineError):
            e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1))
        with self.assertRaises(EngineError):
            e.set_strategy_status("orb-nifty50", "running")

    def test_stop_loss_closes_position(self):
        e, _ = make_engine()
        step(e)
        e.place_order(OrderIn(symbol="INFY", side="BUY", qty=5))
        pos = e.positions[0]
        e.positions[0]["sl"] = pos["avg"] * 10  # force the stop above any price
        step(e)
        self.assertEqual(len(e.positions), 0)
        self.assertEqual(e.db.recent_trades(1)[0]["reason"], "Stop-loss hit")

    def test_daily_loss_limit_engages_kill_switch(self):
        e, _ = make_engine()
        step(e)
        e.update_risk(RiskIn(maxDailyLoss=500, maxOpenPositions=5, maxCapitalPerTrade=400000,
                             totalCapital=500000, autoSquareOffTime="15:19"))
        e.place_order(OrderIn(symbol="TCS", side="BUY", qty=90))
        e.positions[0]["avg"] = e.prices["TCS"] + 50  # instant unrealised loss of 5000
        step(e)
        self.assertTrue(e.killed)
        self.assertEqual(len(e.positions), 0)

    def test_limit_order_waits_then_fills_once(self):
        e, _ = make_engine()
        step(e)
        ltp = e.prices["TCS"]
        e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1, type="LIMIT", price=ltp * 0.5))
        self.assertEqual(len(e.pending), 1)
        e.cancel_order(e.pending[0]["id"])
        self.assertEqual(len(e.pending), 0)
        e.place_order(OrderIn(symbol="TCS", side="BUY", qty=1, type="LIMIT", price=ltp * 1.5))
        self.assertEqual(len(e.positions), 1)  # marketable -> immediate fill
        orders = [o for o in e.db.recent_orders() if o["symbol"] == "TCS"]
        self.assertEqual(len([o for o in orders if o["status"] == "COMPLETE"]), 1)

    def test_orb_runs_a_full_day_within_invariants(self):
        trades_seen = 0
        for seed in range(1, 8):
            e, _ = make_engine(seed)
            s = e.create_strategy(orb_payload())
            e.promote_strategy(s["id"], "Backtest")
            e.promote_strategy(s["id"], "Paper")
            e.set_strategy_status(s["id"], "running")
            step(e, 380)
            self.assertEqual(len(e.positions), 0, "everything flat after square-off")
            per_stock: dict[str, int] = {}
            for o in e.db.recent_orders(1000):
                if o["strategyId"] == s["id"] and o["status"] == "COMPLETE" and "ORB" in o["note"]:
                    per_stock[o["symbol"]] = per_stock.get(o["symbol"], 0) + 1
            self.assertTrue(all(n <= 2 for n in per_stock.values()))
            trades_seen += len(e.db.recent_trades(1000))
        self.assertGreater(trades_seen, 0, "ORB should trade on at least one seed")

    def test_unsupported_template_cannot_run(self):
        e, _ = make_engine()
        s = e.create_strategy(StrategyIn(name="fb", template="FinBaba", instrument="NIFTY",
                                         timeframe="5m",
                                         params={"isl": 50, "csl": 30, "level": "L0", "lots": 1,
                                                 "squareOffTime": "15:15"}))
        e.promote_strategy(s["id"], "Backtest")
        e.promote_strategy(s["id"], "Paper")
        with self.assertRaises(EngineError):
            e.set_strategy_status(s["id"], "running")

    def test_live_mode_is_refused(self):
        e, _ = make_engine()
        with self.assertRaises(EngineError) as c:
            e.set_mode("live")
        self.assertEqual(c.exception.status, 403)
        with self.assertRaises(EngineError):
            s = e.strategies[0]
            e.promote_strategy(s["id"], "Live")

    def test_state_survives_restart(self):
        e, db = make_engine()
        step(e)
        e.place_order(OrderIn(symbol="TCS", side="BUY", qty=2))
        e.set_kill(True)
        e2, _ = make_engine(db=db)
        self.assertEqual(len(e2.positions), 1)
        self.assertTrue(e2.killed)

    def test_strategy_validation(self):
        with self.assertRaises(Exception):
            orb_payload(initialSlPercent=0)
        with self.assertRaises(Exception):
            orb_payload(squareOffTime="25:99")


if __name__ == "__main__":
    unittest.main()
