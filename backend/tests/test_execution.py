"""Deterministic execution tests; no market APIs or real broker calls."""
import math
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from pydantic import ValidationError
from app.db.database import Database
from app.schemas import StrategyIn, RiskIn
from app.services.broker import PaperBroker
from app.services.candles import IST, aggregate, timeframe_minutes
from app.services.conditions import REGISTRY, evaluate, validate_rules
from app.services.engine import EngineError, TradingEngine
from app.services.feed import Bar, FeedTick, RealMarketFeed, SimulatedFeed, build_feed

START = datetime(2026, 10, 15, 9, 15, tzinfo=IST)

def rule(left="Price", op="greater than", right="100", connector="AND"):
    return dict(indicator=left, operator=op, value=right, connector=connector)

def payload(rules=None, **over):
    data = dict(name="test", template="Custom", instrument="TCS", timeframe="1m",
        params=dict(quantity=7, stopLossPercent=1, targetPercent=2, squareOffTime="15:15"),
        entryRules=[rule()] if rules is None else rules, exitRules=[])
    data.update(over)
    return StrategyIn(**data)

class Tape:
    kind = "simulated"
    now = START
    def __init__(self):
        self.history = {"TCS": []}
        self.index = 0
    def tick(self, close, high=None, low=None, opening=None):
        at = START + timedelta(minutes=self.index)
        self.index += 1
        b = Bar("TCS", int(at.timestamp()), opening or close, high or close, low or close, close, 100)
        self.history["TCS"].append(b)
        self.now = at + timedelta(minutes=1)
        return FeedTick(self.now, True, False, {"TCS": b})

def setup(db=None):
    tape = Tape()
    return TradingEngine(db or Database(":memory:"), tape, PaperBroker(0)), tape

def indicator_bars(closes):
    return [dict(time=i*60, open=c, high=c+1, low=c-1, close=c, volume=10+i, session="2026-10-15", sessionFirst=i==0) for i,c in enumerate(closes)]

class ConditionTests(unittest.TestCase):
    def test_reference_sma_ema_rsi(self):
        bars = indicator_bars([1,2,3,4,8])
        self.assertEqual(REGISTRY["SMA"](bars,3), [None,None,2,3,5])
        self.assertEqual(REGISTRY["EMA"](bars,3), [None,None,2,3,5.5])
        bars = indicator_bars([44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00])
        rsi = REGISTRY["RSI"](bars,14)
        self.assertAlmostEqual(rsi[14],70.464135,places=5)
        self.assertAlmostEqual(rsi[15],66.249619,places=5)
        self.assertEqual(REGISTRY["RSI"](indicator_bars([5]*20),14)[-1],50)
        self.assertEqual(REGISTRY["RSI"](indicator_bars(list(range(20))),14)[-1],100)

    def test_vwap_and_range(self):
        bars = indicator_bars([10,20,30])
        bars[0]["volume"],bars[1]["volume"] = 10,30
        bars[2]["session"] = "next"
        bars[2]["sessionFirst"] = True
        self.assertEqual(REGISTRY["VWAP"](bars,0), [10,17.5,30])
        bars[1]["volume"] = None
        self.assertIsNone(REGISTRY["VWAP"](bars,0)[1])
        bars = indicator_bars([10,20,5])
        self.assertEqual(REGISTRY["OPENING RANGE HIGH"](bars,0), [11]*3)
        self.assertEqual(REGISTRY["OPENING RANGE LOW"](bars,0), [9]*3)
        bars[0]["sessionFirst"] = False
        self.assertEqual(REGISTRY["OPENING RANGE HIGH"](bars,0), [None]*3)

    def test_supertrend_atr_and_direction(self):
        bars = indicator_bars([10]*12+[20,22,2])
        series = REGISTRY["SUPERTREND"](bars,10)
        self.assertEqual(series[:9],[None]*9)
        self.assertEqual(series[9:12],[16]*3)
        self.assertLess(series[12],bars[12]["close"])
        self.assertGreater(series[-1],bars[-1]["close"])

    def test_every_builder_operand_and_operator(self):
        bars = indicator_bars([100+math.sin(i/3)*10+i/5 for i in range(80)])
        for name in ["EMA 9","SMA 20","RSI 14","Price","Opening Range High","Opening Range Low","VWAP","Supertrend","123.5"]:
            for op in ["crosses above","crosses below","greater than","less than","is above","is below","equals"]:
                with self.subTest(name=name,op=op):
                    result = evaluate([rule(name,op,"Price")],bars)
                    self.assertIsInstance(result.matched,bool)
                    self.assertIsNotNone(result.conditions[0]["left"])

    def test_crossovers_crossunders_and_equality_boundary(self):
        for closes,operand,op,expected in [([3,1,4],"SMA 2","crosses above",True),([1,3,0.5],"SMA 2","crosses below",True),([3,4,5],"2","crosses above",False),([2,3],"2","crosses_above",True),([2,1],"2","crosses below",True)]:
            self.assertEqual(evaluate([rule("Price",op,operand)],indicator_bars(closes)).matched,expected)

    def test_logic_all_evaluated_and_precedence(self):
        bars = indicator_bars([100])
        result = evaluate([rule(right="200"),rule(right="50",connector="OR"),rule(right="200")],bars)
        self.assertFalse(result.matched)
        self.assertEqual(len(result.conditions),3)
        self.assertTrue(evaluate([rule(right="200"),rule(right="50",connector="OR")],bars).matched)
        self.assertTrue(evaluate([rule(right="0"),rule("SMA 20",right="10",connector="OR")],bars).matched)
        self.assertIsNone(evaluate([rule(right="0"),rule("SMA 20",right="10")],bars).matched)

    def test_invalid_and_warmup(self):
        for r in [rule("Bogus"),rule("EMA 0"),rule("EMA 501"),rule(op="bogus"),rule(right="NaN")]:
            with self.subTest(rule=r),self.assertRaises(ValueError): validate_rules([r])
        self.assertIsNone(evaluate([rule("EMA 21")],indicator_bars([100]*20)).matched)
        self.assertIsNone(evaluate([rule("EMA 21","crosses above","100")],indicator_bars([100]*21)).matched)

class CandleTests(unittest.TestCase):
    def bars(self,n):
        return [Bar("TCS",int((START+timedelta(minutes=i)).timestamp()),100+i,102+i,99+i,101+i,i+1) for i in range(n)]
    def test_all_timeframes_exact_ohlcv_and_incomplete_bars(self):
        for tf in ["1m","5m","15m","30m","1h","4h","7m"]:
            n = timeframe_minutes(tf)
            bars = self.bars(n)
            result = aggregate(bars,tf,START+timedelta(minutes=n),"TCS")
            self.assertEqual(len(result),1,tf)
            self.assertEqual(result[0]["close"],100+n)
            self.assertEqual(result[0]["volume"],sum(range(1,n+1)))
            self.assertTrue(result[0]["sessionFirst"])
            self.assertEqual(aggregate(bars,tf,START+timedelta(minutes=n)-timedelta(seconds=1),"TCS"),[])
    def test_duplicates_gaps_order_and_session_tail(self):
        bars = self.bars(11)
        self.assertEqual(len(aggregate(list(reversed(bars))+[bars[0]],"5m",START+timedelta(minutes=11),"TCS")),2)
        self.assertEqual(aggregate([b for i,b in enumerate(bars) if i!=2],"5m",START+timedelta(minutes=11),"TCS")[0]["time"],bars[5].time)
        self.assertEqual(len(aggregate([bars[0],bars[2]],"1m",START+timedelta(minutes=3),"TCS")),1)
        bars = [Bar("TCS",int((START+timedelta(hours=i)).timestamp()),100,110,90,100,10) for i in range(7)]
        result = aggregate(bars,"4h",START+timedelta(minutes=375),"TCS",source_minutes=60)
        self.assertEqual([c["volume"] for c in result],[40,30])

class ExecutionTests(unittest.TestCase):
    def test_save_entry_target_history_pnl_logs(self):
        e,t = setup()
        s = e.create_strategy(payload())
        self.assertEqual((s["status"],s["stage"],e.mode),("running","Paper","paper"))
        tick = t.tick(101)
        e.on_tick(tick)
        self.assertEqual(len(e.positions),1)
        pos = e.positions[0]
        self.assertEqual((pos["symbol"],pos["qty"],pos["avg"]),("TCS",7,101))
        self.assertAlmostEqual(pos["sl"],99.99)
        self.assertAlmostEqual(pos["target"],103.02)
        e.on_tick(tick)
        self.assertEqual(len(e.db.recent_orders()),1)
        e.on_tick(t.tick(104,high=104,low=101,opening=101))
        self.assertEqual(e.positions,[])
        trade = e.db.recent_trades()[0]
        self.assertEqual(trade["reason"],"Target hit")
        self.assertAlmostEqual(trade["pnl"],2.02*7)
        self.assertEqual(len(e.db.recent_orders()),2)
        self.assertEqual(e.snapshot()["realizedPnl"],trade["pnl"])
        self.assertEqual(e.snapshot()["openPnl"],0)
        self.assertTrue({"evaluation","signal","entry","exit"} <= {l["kind"] for l in e.db.execution_logs(s["id"])})

    def test_stop_gap_no_reentry_and_restart(self):
        e,t = setup()
        e.create_strategy(payload([rule(right="50")]))
        e.on_tick(t.tick(100))
        e.on_tick(t.tick(95))
        self.assertEqual(e.db.recent_trades()[0]["exit"],95)
        self.assertFalse(e.positions)
        restarted = TradingEngine(e.db,t,PaperBroker(0))
        restarted.on_tick(t.tick(96))
        self.assertFalse(restarted.positions)
        restarted.on_tick(t.tick(40))
        restarted.on_tick(t.tick(100))
        self.assertEqual(len(restarted.positions),1)

    def test_pause_resume_stop_independent_strategies(self):
        e,t = setup()
        a = e.create_strategy(payload())
        b = e.create_strategy(payload(name="other"))
        e.set_strategy_status(a["id"],"paused")
        e.on_tick(t.tick(101))
        self.assertEqual([p["strategyId"] for p in e.positions],[b["id"]])
        e.set_strategy_status(a["id"],"running")
        e.on_tick(t.tick(101))
        self.assertEqual(len(e.positions),1)
        e.on_tick(t.tick(99))
        e.on_tick(t.tick(101))
        self.assertEqual({p["strategyId"] for p in e.positions},{a["id"],b["id"]})
        e.set_strategy_status(a["id"],"stopped")
        e.on_tick(t.tick(90))
        self.assertFalse(e.positions)
        self.assertEqual(TradingEngine(e.db,t,PaperBroker(0))._find_strategy(a["id"])["status"],"stopped")

    def test_crossover_executes_once(self):
        e,t = setup()
        e.create_strategy(payload([rule("Price","crosses above","100")]))
        e.on_tick(t.tick(99)); self.assertFalse(e.positions)
        e.on_tick(t.tick(101)); self.assertEqual(len(e.positions),1)
        e.on_tick(t.tick(101)); self.assertEqual(len(e.db.recent_orders()),1)

    def test_every_indicator_can_generate_paper_entry(self):
        for name in ["EMA 3","SMA 3","RSI 3","Price","Opening Range High","Opening Range Low","VWAP","Supertrend","123"]:
            with self.subTest(indicator=name):
                e,t = setup()
                e.create_strategy(payload([rule(name,"greater than","0")]))
                for _ in range(15): e.on_tick(t.tick(100))
                self.assertEqual(len(e.positions),1)
                self.assertEqual(e.positions[0]["qty"],7)

    def test_timeframe_and_optional_exit(self):
        e,t = setup()
        e.create_strategy(payload(timeframe="5m"))
        for _ in range(4): e.on_tick(t.tick(101))
        self.assertFalse(e.positions)
        e.on_tick(t.tick(101)); self.assertEqual(len(e.positions),1)
        e,t = setup()
        e.create_strategy(payload(exitRules=[rule("Price","less than","100.5")]))
        e.on_tick(t.tick(101)); e.on_tick(t.tick(100.2))
        self.assertEqual(e.db.recent_trades()[0]["reason"],"Exit conditions satisfied")

    def test_no_historical_signal_or_stale_invalid_data(self):
        e,t = setup()
        for _ in range(4): e.on_tick(t.tick(101))
        e.create_strategy(payload())
        e.on_tick(FeedTick(t.now,True,False,{"TCS":t.history["TCS"][-1]}))
        self.assertFalse(e.positions)
        e.on_tick(t.tick(101)); self.assertEqual(len(e.positions),1)
        e,t = setup(); e.create_strategy(payload())
        tick = t.tick(101)
        e.on_tick(FeedTick(tick.market_time+timedelta(minutes=10),True,False,tick.bars))
        self.assertFalse(e.positions)
        e.on_tick(FeedTick(tick.market_time,True,False,{})); self.assertFalse(e.positions)
        invalid = Bar("TCS",int(START.timestamp()),100,100,99,math.nan,1)
        e.on_tick(FeedTick(START+timedelta(minutes=1),True,False,{"TCS":invalid}))
        self.assertFalse(e.positions)

    def test_risk_rejection_once_and_atomic_rollback(self):
        e,t = setup()
        e.update_risk(RiskIn(maxDailyLoss=50,maxOpenPositions=2,maxCapitalPerTrade=100,totalCapital=1000,autoSquareOffTime="15:19"))
        e.create_strategy(payload())
        for _ in range(3): e.on_tick(t.tick(101))
        self.assertFalse(e.positions)
        self.assertEqual(len(e.db.recent_orders()),1)
        self.assertEqual(e.db.recent_orders()[0]["status"],"REJECTED")
        e,t = setup(); e.create_strategy(payload())
        before = e.db.get("strategyRuntime")
        with patch.object(e.db,"add_execution_log",side_effect=RuntimeError("disk failed")):
            with self.assertRaises(RuntimeError): e.on_tick(t.tick(101))
        self.assertFalse(e.positions)
        self.assertEqual(e.db.recent_orders(),[])
        self.assertEqual(e.db.get("strategyRuntime"),before)
        self.assertEqual(e.runtime,before)

    def test_schema_matches_builder_and_rejects_invalid(self):
        for tf in ["1m","5m","15m","30m","1h","4h","7m","2h"]:
            self.assertEqual(payload(timeframe=tf,instrument="AAPL").timeframe,tf)
        for over in [dict(timeframe="custom"),dict(timeframe="0m"),dict(entryRules=[]),dict(entryRules=[rule("Bogus")]),dict(params=dict(quantity=1.5)),dict(params=dict(quantity=0)),dict(params=dict(stopLossPercent=0)),dict(params=dict(targetPercent=float("nan")))]:
            with self.subTest(over=over),self.assertRaises(ValidationError): payload(**over)
        self.assertEqual(payload().exitRules,[])

    def test_entries_obey_every_selected_timeframe(self):
        for tf in ["1m", "5m", "15m", "30m", "1h", "4h", "7m"]:
            with self.subTest(timeframe=tf):
                e,t = setup()
                e.create_strategy(payload([rule(right="0")], timeframe=tf))
                n = timeframe_minutes(tf)
                for _ in range(n-1):
                    e.on_tick(t.tick(100))
                self.assertFalse(e.positions)
                e.on_tick(t.tick(100))
                self.assertEqual(len(e.positions), 1)

    def test_entry_minute_ignores_pre_entry_extremes_but_observes_new_ones(self):
        e,t = setup()
        e.create_strategy(payload())
        first = t.tick(101, high=110, low=90)
        e.on_tick(first)
        self.assertEqual(len(e.positions), 1)
        bar = first.bars["TCS"]
        updated = Bar("TCS", bar.time, 101, 110, 90, 101.1, 110)
        e.on_tick(FeedTick(first.market_time, True, False, {"TCS": updated}))
        self.assertEqual(len(e.positions), 1)
        # A new low confirms a stop touch after the fill; the gap price is the
        # observed last price when only an intra-minute low reveals the touch.
        updated = Bar("TCS", bar.time, 101, 110, 89, 101.1, 120)
        e.on_tick(FeedTick(first.market_time, True, False, {"TCS": updated}))
        self.assertFalse(e.positions)
        self.assertEqual(e.db.recent_trades()[0]["reason"], "Stop-loss hit")

    def test_strategy_failure_isolated_without_partial_orders(self):
        e,t = setup()
        failed = e.create_strategy(payload(name="bad"))
        good = e.create_strategy(payload(name="good"))
        original = e._run_custom
        def broken(s, tick):
            original(s, tick)
            if s["id"] == failed["id"]:
                raise RuntimeError("injected after entry")
        with patch.object(e, "_run_custom", side_effect=broken):
            e.on_tick(t.tick(101))
        self.assertEqual([p["strategyId"] for p in e.positions], [good["id"]])
        self.assertEqual([o["strategyId"] for o in e.db.recent_orders()], [good["id"]])
        self.assertEqual(e._find_strategy(failed["id"])["status"], "stopped")
        self.assertEqual(e._find_strategy(good["id"])["status"], "running")

    def test_builder_contract_has_execution_for_every_option(self):
        import re
        from pathlib import Path
        source = (Path(__file__).resolve().parents[2]/"src/config/defaults.ts").read_text()
        block = source.split("export const INDICATOR_TYPES = [", 1)[1].split("];", 1)[0]
        for operand in re.findall(r'value: "([^"]+)"', block):
            if operand != "Number":
                validate_rules([rule(operand)])
        block = source.split("export const OPERATORS_LIST = [", 1)[1].split("];", 1)[0]
        for op in re.findall(r'"([^"]+)"', block):
            validate_rules([rule(op=op)])

    def test_feed_config(self):
        self.assertIsInstance(build_feed("simulated"),SimulatedFeed)
        feed = build_feed("real_market")
        self.assertIsInstance(feed,RealMarketFeed)
        feed.close()



class FeedTests(unittest.TestCase):
    def test_provider_failure_and_stale_candles_never_become_fresh_quotes(self):
        from concurrent.futures import Future
        feed = RealMarketFeed()
        feed.symbols = {"TCS"}
        feed.requests = set()  # no worker or external network in this test
        failed = Future()
        failed.set_exception(OSError("provider unavailable"))
        feed.jobs[("TCS", "1m")] = failed
        with self.assertLogs("feed", level="WARNING"):
            tick = feed.next()
        self.assertEqual(tick.bars, {})
        self.assertIn("provider unavailable", feed.errors["TCS"])
        stale = Future()
        old = int(datetime.now(IST).timestamp())-3600
        stale.set_result([dict(time=old,open=100,high=101,low=99,close=100,volume=10)])
        feed.jobs[("TCS", "1m")] = stale
        tick = feed.next()
        self.assertEqual(tick.bars, {})
        self.assertEqual(feed.history["TCS"][0].time, old)
        self.assertNotIn("TCS", feed.prices)
        feed.close()

    def test_selected_symbols_timeframe_divisors_and_us_metadata(self):
        feed = RealMarketFeed()
        s = {**payload(instrument="AAPL",timeframe="4h").model_dump(), "status":"running"}
        feed.set_symbols({"AAPL"},[s])
        self.assertIn(("AAPL","1m"),feed.requests)
        self.assertIn(("AAPL","1h"),feed.requests)
        self.assertEqual(feed._base(7),"1m")
        feed.close()


if __name__ == "__main__":
    unittest.main()
