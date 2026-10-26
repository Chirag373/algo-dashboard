import unittest
from app.services.conditions import attach_vix, evaluate, uses_vix
from app.services.backtest import run_saved_backtest
from app.services.feed import RealMarketFeed
from tests.test_execution import rule, payload, setup
from tests.test_backtest import strategy, flat, NOW, load_rows


class VixTests(unittest.TestCase):
    def test_exact_alignment_threshold_and_cross(self):
        bars = [dict(time=i*60, end=(i+1)*60, close=100) for i in range(3)]
        vix = [{**bars[0], 'close': 14}, {**bars[1], 'close': 16}]
        combined = attach_vix(bars, vix)
        self.assertTrue(evaluate([rule('VIX', 'crosses above', '15')], combined, index=1).matched)
        self.assertFalse(evaluate([rule('VIX', 'less than', '15')], combined, index=1).matched)
        self.assertIsNone(evaluate([rule('VIX', 'greater than', '15')], combined, index=2).matched)
        self.assertTrue(uses_vix(payload([rule('VIX', 'less than', '20')]).model_dump()))

    def test_backtest_uses_separate_vix_history(self):
        saved = strategy([rule('VIX', 'greater than', '15')])
        requested = []
        def loader(symbol, *args, **kwargs):
            requested.append(symbol)
            return load_rows(flat('2026-10-15', 4, 16 if symbol == 'INDIA VIX' else 101))(symbol, *args, **kwargs)
        result = run_saved_backtest(saved, 15, None, 0, 0, now=NOW, loader=loader)
        self.assertIn('INDIA VIX', requested)
        self.assertEqual(result['trades'][0]['symbol'], 'TCS')
        self.assertNotIn('INDIA VIX', result['requestedInstruments'])

    def test_missing_vix_does_not_use_stock_price(self):
        engine, tape = setup()
        engine.create_strategy(payload([rule('VIX', 'greater than', '15')]))
        engine.on_tick(tape.tick(101))
        self.assertFalse(engine.positions)

    def test_feed_subscribes_to_vix_for_selected_timeframe(self):
        feed = RealMarketFeed()
        try:
            saved = payload([rule('VIX', 'less than', '20')], timeframe='15m').model_dump()
            saved['status'] = 'running'
            feed.set_symbols({'TCS'}, [saved])
            self.assertIn(('INDIA VIX', '15m'), feed.requests)
            self.assertIn(('INDIA VIX', '1m'), feed.requests)
        finally:
            feed.close()
