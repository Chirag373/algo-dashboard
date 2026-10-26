import unittest
from unittest.mock import patch
from app.services.conditions import attach_usdinr, evaluate
from app.services.currency_reference import pin_usdinr, reference_key
from app.services.backtest import run_saved_backtest
from app.services.feed import Bar, RealMarketFeed
from app.services.history import HistoryError
from tests.test_execution import rule, payload, setup
from tests.test_backtest import strategy, flat, NOW, load_rows


REFERENCE = dict(usdinrSymbol='USDINR99JANFUT', usdinrToken=123, usdinrExpiry='2099-01-30')


class UsdinrTests(unittest.TestCase):
    def test_contract_is_selected_and_pinned(self):
        saved = strategy([rule('USDINR', 'greater than', '90')])
        csv = b'name,instrument_type,expiry,tradingsymbol,instrument_token\nUSDINR,FUT,2099-02-25,USDINR99FEBFUT,2\nUSDINR,FUT,2099-01-30,USDINR99JANFUT,1\nUSDINR,CE,2099-01-30,USDINR99JAN90CE,3\n'
        with patch('app.services.currency_reference.get_access_token', return_value='test'), patch('app.services.currency_reference.request', return_value=csv) as request:
            pin_usdinr(saved)
            self.assertEqual(saved['params']['usdinrToken'], 1)
            pin_usdinr(saved)
            self.assertEqual(request.call_count, 1)
            self.assertEqual(reference_key(saved), 'CDS:USDINR99JANFUT:1')

    def test_alignment_crossover_and_missing_reference(self):
        bars = [dict(time=i*60, end=(i+1)*60, close=100) for i in range(3)]
        reference = [{**bars[0], 'close': 89}, {**bars[1], 'close': 91}]
        series = attach_usdinr(bars, reference)
        self.assertTrue(evaluate([rule('USDINR', 'crosses above', '90')], series, index=1).matched)
        self.assertIsNone(evaluate([rule('USDINR', 'greater than', '90')], series, index=2).matched)

    def test_paper_executes_stock_using_currency_filter(self):
        engine, tape = setup()
        data = payload([rule('USDINR', 'greater than', '90')])
        data.params.update(REFERENCE)
        saved = engine.create_strategy(data)
        tick = tape.tick(101)
        key = reference_key(saved)
        source = tick.bars['TCS']
        tape.history[key] = [Bar(key, source.time, 91, 91, 91, 91, 100)]
        engine.on_tick(tick)
        self.assertEqual([p['symbol'] for p in engine.positions], ['TCS'])
        self.assertEqual(engine.positions[0]['qty'], 7)

    def test_historical_reference_is_pinned_not_current_quote(self):
        saved = strategy([rule('USDINR', 'greater than', '90')])
        saved['params'].update(REFERENCE)
        requested = []
        def loader(symbol, *args, **kwargs):
            requested.append(symbol)
            return load_rows(flat('2026-10-15', 4, 91 if symbol.startswith('CDS:') else 101))(symbol, *args, **kwargs)
        result = run_saved_backtest(saved, 15, None, 0, 0, now=NOW, loader=loader)
        self.assertIn('CDS:USDINR99JANFUT:123', requested)
        self.assertEqual(result['trades'][0]['symbol'], 'TCS')
        saved['params'].pop('usdinrToken')
        with self.assertRaisesRegex(HistoryError, 'Save the strategy'):
            run_saved_backtest(saved, 15, None, 0, 0, now=NOW, loader=loader)

    def test_subscription_forces_minute_reference_for_stock_session_alignment(self):
        feed = RealMarketFeed()
        try:
            saved = strategy([rule('USDINR', 'less than', '95')])
            saved['params'].update(REFERENCE)
            saved.update(status='running', timeframe='30m')
            key = reference_key(saved)
            feed.set_symbols({'TCS'}, [saved])
            self.assertIn((key, '1m'), feed.requests)
            self.assertNotIn((key, '30m'), feed.requests)
        finally:
            feed.close()
