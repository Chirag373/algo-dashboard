import unittest
from app.schemas import StrategyIn
from app.services.engine import TradingEngine
from app.services.backtest import run_saved_backtest
from tests.test_backtest import strategy, flat, NOW, load_rows


class MultipleInstrumentTests(unittest.TestCase):
    def test_saved_selections_and_legacy_compatibility(self):
        value = strategy()
        value["instruments"] = ["TCS", "INFY", "TCS"]
        saved = StrategyIn.model_validate(value).model_dump()
        self.assertEqual(saved["instruments"], ["TCS", "INFY"])
        self.assertEqual(saved["instrument"], "TCS")
        self.assertEqual(TradingEngine._universe(saved["instrument"], saved["instruments"]), ["TCS", "INFY"])
        self.assertEqual(StrategyIn.model_validate(strategy()).instruments, [strategy()["instrument"]])

    def test_backtest_trades_each_selected_symbol_with_saved_quantity(self):
        value = strategy()
        value["instruments"] = ["TCS", "INFY"]
        result = run_saved_backtest(value, 15, None, 0, 0, now=NOW, loader=load_rows(flat("2026-10-15", 4, 101)))
        self.assertEqual({t["symbol"] for t in result["trades"]}, {"TCS", "INFY"})
        self.assertTrue(all(t["qty"] == 7 for t in result["trades"]))

    def test_paper_execution_enters_each_selected_stock(self):
        from tests.test_execution import setup, payload
        from app.services.feed import Bar
        engine, tape = setup()
        saved = engine.create_strategy(payload(instruments=['TCS', 'INFY']))
        tick = tape.tick(101)
        source = tick.bars['TCS']
        second = Bar('INFY', source.time, 101, 101, 101, 101, 100)
        tape.history['INFY'] = [second]
        tick.bars['INFY'] = second
        engine.on_tick(tick)
        positions = [p for p in engine.positions if p['strategyId'] == saved['id']]
        self.assertEqual({p['symbol'] for p in positions}, {'TCS', 'INFY'})
        self.assertTrue(all(p['qty'] == 7 for p in positions))
