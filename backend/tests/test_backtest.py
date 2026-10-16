"""Historical replay invariants and API isolation; fixtures never reach production."""
import copy
import json
import math
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

from app.services.backtest import run_saved_backtest
from app.services.candles import IST
from app.services.history import HistoricalData, HistoryError, InstrumentUnavailable, fetch_history
from tests.test_execution import payload, rule
from tests import test_execution_api as api_helpers

NOW = datetime(2026,10,16,12,tzinfo=IST)

def bars(day, prices):
    at = datetime.fromisoformat(day).replace(hour=9,minute=15,tzinfo=IST)
    return [dict(time=int((at+timedelta(minutes=i)).timestamp()),open=o,high=h,low=l,close=c,volume=100) for i,(o,h,l,c) in enumerate(prices)]

def flat(day, n=20, price=100):
    return bars(day,[(price,price,price,price)]*n)

def strategy(rules=None, **over):
    return {**payload(rules,**over).model_dump(),"id":"saved","version":3}

def load_rows(rows):
    def load(symbol, timeframe, start, end, warmup_start, **kwargs):
        return HistoricalData([r for r in rows if warmup_start.timestamp() <= r["time"] < end.timestamp()],"Fixture provider",1)
    return load

def run(rows, s=None, days=15, fee=0, slip=0, **kwargs):
    return run_saved_backtest(s or strategy(),days,100000,slip,fee,now=NOW,loader=load_rows(rows),**kwargs)

class BacktestTests(unittest.TestCase):
    def test_next_open_target_fee_and_equity(self):
        rows = bars("2026-10-15",[(101,101,101,101),(102,105,102,104),(104,104,104,104)])
        result = run(rows,fee=1)
        self.assertEqual(result["summary"]["totalTrades"],1)
        t = result["trades"][0]
        self.assertEqual(t["entry"],102)  # not the signal close at 101
        self.assertEqual(t["exit"],104.04)
        self.assertEqual(t["qty"],7)
        self.assertEqual(t["fees"],2)
        self.assertEqual(t["pnl"],12.28)
        self.assertEqual(t["reason"],"Target hit")
        self.assertLessEqual(t["signalTime"],t["entryTime"])
        self.assertEqual(result["summary"]["totalPnl"],12.28)
        self.assertEqual(result["curve"][-1]["equity"],100012.28)
        self.assertEqual(result["summary"]["totalFees"],2)
        self.assertIsNone(result["summary"]["sharpeRatio"])
        self.assertTrue(result["summary"]["profitFactorInfinite"])

    def test_stop_gap_and_both_touched_stop_first(self):
        result = run(bars("2026-10-15",[(101,101,101,101),(102,102,102,102),(95,105,94,100)]))
        self.assertEqual(result["trades"][0]["exit"],95)
        result = run(bars("2026-10-15",[(101,101,101,101),(102,110,90,102)]))
        self.assertEqual(result["trades"][0]["exit"],100.98)
        self.assertEqual(result["trades"][0]["reason"],"Stop-loss hit")

    def test_slippage_both_sides_and_terminal_liquidation(self):
        result = run(flat("2026-10-15",3,101),slip=0.1,fee=2)
        t = result["trades"][0]
        self.assertEqual(t["entry"],101.10)
        self.assertEqual(t["exit"],100.90)
        self.assertEqual(t["reason"],"End of backtest")
        self.assertEqual(t["pnl"],-5.40)
        self.assertEqual(result["summary"]["portfolioValue"],99994.60)
        self.assertAlmostEqual(result["summary"]["maxDrawdown"],5.40)

    def test_saved_quantity_and_multiple_and_or_conditions(self):
        s = strategy([rule(right="1000"),rule("SMA 2","greater than","0",connector="OR"),rule("RSI 2","equals","50")])
        s["params"]["quantity"] = 13
        result = run(flat("2026-10-15",10,101),s)
        self.assertEqual(result["trades"][0]["qty"],13)
        self.assertEqual(len(result["trades"]),1)
        never = strategy([rule(right="1000"),rule("Price","less than","0",connector="OR")])
        self.assertEqual(run(flat("2026-10-15",10,101),never)["summary"]["totalTrades"],0)

    def test_all_builder_indicators_and_timeframes(self):
        for name in ["EMA 3","SMA 3","RSI 3","Price","Opening Range High","Opening Range Low","VWAP","Supertrend","123"]:
            with self.subTest(indicator=name):
                result = run(flat("2026-10-15",30),strategy([rule(name,"greater than","0")]))
                self.assertEqual(len(result["trades"]),1)
        for tf in ["1m","5m","15m","30m","1h","4h","7m"]:
            with self.subTest(timeframe=tf):
                result = run(flat("2026-10-15",300,101),strategy(timeframe=tf))
                self.assertEqual(len(result["trades"]),1)
                minute = int(result["trades"][0]["entryTime"][14:16])
                self.assertEqual(result["strategy"]["timeframe"],tf)

    def test_crossover_and_exit_rules_no_duplicate_signal(self):
        rows = bars("2026-10-15",[(99,99,99,99),(101,101,101,101),(101,101,101,101),(101,101,101,101)])
        result = run(rows,strategy([rule("Price","crosses above","100")]))
        self.assertEqual(len(result["trades"]),1)
        self.assertIn("09:17",result["trades"][0]["entryTime"])
        s = strategy(exitRules=[rule("Price","less than","100.5")])
        rows = bars("2026-10-15",[(101,101,101,101),(101,101,100.2,100.2),(100.1,100.1,100.1,100.1)])
        result = run(rows,s)
        self.assertEqual(result["trades"][0]["reason"],"Exit conditions satisfied")
        self.assertEqual(result["trades"][0]["exit"],100.1)

    def test_warmup_does_not_trade_outside_requested_period(self):
        rows = flat("2026-09-30",100,101)+flat("2026-10-15",10,101)
        result = run(rows,strategy([rule("SMA 50","greater than","0")]))
        self.assertEqual(result["period"]["calendarDays"],15)
        self.assertTrue(all(t["entryTime"]>=result["period"]["requestedStart"] for t in result["trades"]))
        self.assertEqual(len(result["trades"]),1)
        self.assertEqual(result["coverage"][0]["sessions"],["2026-10-15"])

    def test_horizon_and_strategy_changes_give_distinct_genuine_results(self):
        rows = flat("2026-09-25",4,101)+flat("2026-10-15",4,102)
        short = run(rows,days=15,fee=1)
        long = run(rows,days=30,fee=1)
        self.assertNotEqual(short["period"],long["period"])
        # Flat true conditions remain latched across sessions; use crosses for
        # independent daily opportunities to test distinct trade counts.
        rows = bars("2026-09-25",[(99,99,99,99),(101,101,101,101),(101,101,101,101)])+bars("2026-10-15",[(99,99,99,99),(101,101,101,101),(101,101,101,101)])
        s = strategy([rule("Price","crosses above","100")])
        self.assertEqual(len(run(rows,s,days=15)["trades"]),1)
        self.assertEqual(len(run(rows,s,days=30)["trades"]),2)
        self.assertEqual(len(run(rows,strategy([rule(right="1000")]),days=30)["trades"]),0)

    def test_missing_candles_warmup_and_no_data_are_transparent(self):
        rows = flat("2026-10-15",10)
        rows.pop(3)
        result = run(rows,strategy([rule("SMA 20","greater than","0")]))
        self.assertFalse(result["trades"])
        self.assertTrue(any("gaps" in w for w in result["warnings"]))
        self.assertTrue(any("unavailable" in w for w in result["warnings"]))
        with self.assertRaises(HistoryError): run([])

    def test_monthly_daily_sharpe_profit_factor_and_no_nan(self):
        rows = bars("2026-09-30",[(99,99,99,99),(101,101,101,101),(101,104,101,104)])+bars("2026-10-15",[(99,99,99,99),(101,101,101,101),(101,101,98,98)])
        result = run(rows,strategy([rule("Price","crosses above","100")]),days=30)
        self.assertEqual(len(result["monthlyReturns"]),2)
        pnl = [t["pnl"] for t in result["trades"]]
        self.assertAlmostEqual(result["summary"]["profitFactor"],sum(max(0,x) for x in pnl)/abs(sum(min(0,x) for x in pnl)))
        self.assertIsNotNone(result["summary"]["sharpeRatio"])
        self.assertAlmostEqual(sum(m["pnl"] for m in result["monthlyReturns"]),result["summary"]["totalPnl"])
        json.dumps(result,allow_nan=False)

    def test_basket_missing_listing_returns_explicit_partial_coverage(self):
        s = strategy(instrument="NIFTY 50 Stocks")
        rows = flat("2026-10-15",5,101)
        def loader(symbol,*args,**kwargs):
            if symbol == "TATAMOTORS":
                raise InstrumentUnavailable("Yahoo listing unavailable (HTTP 404)")
            return HistoricalData(rows,"Fixture provider",1)
        with patch("app.services.backtest.TradingEngine._universe",return_value=["TCS","TATAMOTORS"]):
            result = run_saved_backtest(s,15,100000,0,0,now=NOW,loader=loader)
        self.assertFalse(result["coverageComplete"])
        self.assertEqual(result["requestedInstruments"],["TCS","TATAMOTORS"])
        self.assertEqual(result["excludedInstruments"][0]["symbol"],"TATAMOTORS")
        self.assertEqual([c["symbol"] for c in result["coverage"]],["TCS"])
        self.assertTrue(result["trades"])
        self.assertIn("Partial basket",result["warnings"][0])
        with self.assertRaises(InstrumentUnavailable):
            run_saved_backtest(strategy(instrument="TATAMOTORS"),15,100000,0,0,now=NOW,loader=loader)
        with patch("app.services.backtest.TradingEngine._universe",return_value=["TATAMOTORS","MISSING"]):
            with self.assertRaisesRegex(HistoryError,"No basket instruments"):
                run_saved_backtest(s,15,100000,0,0,now=NOW,loader=lambda *args,**kwargs: (_ for _ in ()).throw(InstrumentUnavailable("No listing")))
        with self.assertRaisesRegex(HistoryError,"authentication"):
            run_saved_backtest(s,15,100000,0,0,now=NOW,loader=lambda *args,**kwargs: (_ for _ in ()).throw(HistoryError("Provider authentication failed")))

    def test_orb_long_short_range_and_quantity(self):
        from tests.test_engine import orb_payload
        for prices,side in [([(100,101,99,100),(100,102,100,102),(103,106,103,105)],"BUY"), ([(100,101,99,100),(100,100,98,98),(97,97,94,95)],"SELL")]:
            s = {**orb_payload(rangeCandleCount=1).model_dump(),"instrument":"TCS","id":"orb","version":1}
            s["params"]["quantity"] = 7
            result = run(bars("2026-10-15",prices),s)
            self.assertEqual(len(result["trades"]),1)
            self.assertEqual(result["trades"][0]["side"],side)
            self.assertEqual(result["trades"][0]["qty"],7)
            self.assertEqual(result["trades"][0]["reason"],"Target hit")

    def test_insufficient_capital_preserves_quantity_and_no_global_mutations(self):
        s = strategy()
        s["params"]["quantity"] = 100000
        before = copy.deepcopy(s)
        result = run(flat("2026-10-15",10,101),s)
        self.assertFalse(result["trades"])
        self.assertTrue(any("capital" in w for w in result["warnings"]))
        self.assertEqual(s,before)

class HistoryTests(unittest.TestCase):
    def test_kite_chunks_requested_dates_and_truthful_source(self):
        start = NOW-timedelta(days=90)
        warm = start-timedelta(days=10)
        calls = []
        def request(url,*args,**kwargs):
            calls.append(url)
            return json.dumps({"status":"success","data":{"candles":[["2026-10-15T09:15:00+0530",100,101,99,100,10]]}}).encode()
        with patch("app.services.history._kite_token",return_value=123),patch("app.services.history._request",side_effect=request):
            data = fetch_history("TCS","4h",start,NOW,warm,token="test-token")
        self.assertEqual(len(calls),4)
        self.assertTrue(all("/123/minute?" in url for url in calls))
        self.assertEqual(data.source,"Zerodha Kite Connect")
        self.assertEqual(data.source_minutes,1)
        self.assertEqual(len(data.candles),1)  # deduplicated chunk boundaries
        self.assertEqual(parse_qs(urlparse(calls[0]).query)["from"][0],warm.strftime("%Y-%m-%d %H:%M:%S"))

    def test_kite_login_and_token_exchange_need_no_optional_sdk(self):
        import hashlib
        from app.services import kite_backtest
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"status":"success","data":{"access_token":"verified-test-token"}}).encode()
        with patch.object(kite_backtest.settings,"KITE_API_KEY","test-key"), patch.object(kite_backtest.settings,"KITE_API_SECRET","test-secret"), patch.object(kite_backtest,"set_access_token") as store, patch("urllib.request.urlopen",return_value=response) as request:
            self.assertIn("api_key=test-key",kite_backtest.get_login_url())
            data = kite_backtest.generate_session("request-token")
            self.assertEqual(data["access_token"],"verified-test-token")
            body = parse_qs(request.call_args.args[0].data.decode())
            self.assertEqual(body["checksum"],[hashlib.sha256(b"test-keyrequest-tokentest-secret").hexdigest()])
            store.assert_called_once_with("verified-test-token")

    def test_provider_errors_do_not_silently_switch_sources(self):
        with patch("app.services.history._kite_token",return_value=123),patch("app.services.history._request",side_effect=HistoryError("Kite token expired")):
            with self.assertRaisesRegex(HistoryError,"expired"):
                fetch_history("TCS","5m",NOW-timedelta(days=30),NOW,NOW-timedelta(days=40),token="test")
        with patch("app.services.history._request") as request:
            with self.assertRaisesRegex(HistoryError,"retention"):
                fetch_history("TCS","1m",datetime.now(IST)-timedelta(days=90),datetime.now(IST),datetime.now(IST)-timedelta(days=100),token="")
            request.assert_not_called()

class BacktestApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api_helpers.ExecutionApiTests()
        self.client.setUp()
    def test_saved_id_contract_and_complete_replay_does_not_touch_trading_state(self):
        _,created = self.client.request("POST","/api/v1/strategies",payload().model_dump())
        sid = created["result"]["id"]
        engine = self.client.engine
        before = copy.deepcopy(engine.snapshot())
        rows = flat("2026-10-15",10,101)
        def replay(s,days,capital,slip,fee):
            return run_saved_backtest(s,days,capital,slip,fee,now=NOW,loader=load_rows(rows))
        with patch("app.services.backtest.run_saved_backtest",side_effect=replay):
            code,result = self.client.request("POST","/api/v1/kite/backtest",dict(strategy_id=sid,days_back=15,capital=100000))
        self.assertEqual(code,200)
        self.assertEqual(result["strategy"]["id"],sid)
        self.assertTrue(result["trades"])
        self.assertEqual(engine.snapshot(),before)
        self.assertEqual(engine.db.recent_orders(),[])
        self.assertEqual(self.client.request("POST","/api/v1/kite/backtest",dict(strategy_id=sid,days_back=0))[0],422)
        self.assertEqual(self.client.request("POST","/api/v1/kite/backtest",dict(strategy_id=sid,days_back=1.5))[0],422)
        self.assertEqual(self.client.request("POST","/api/v1/kite/backtest",dict(strategy_id=sid,days_back=15,strategy={"quantity":1}))[0],422)
        self.assertEqual(self.client.request("POST","/api/v1/kite/backtest",dict(strategy_id="missing",days_back=15))[0],404)

if __name__ == "__main__": unittest.main()
