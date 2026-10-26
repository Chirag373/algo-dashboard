"""Reference indicators use their own OHLCV and never the purchased stock's prices."""
import unittest
from unittest.mock import patch
from app.services.conditions import (REGISTRY, ConditionError, attach_vix, attach_usdinr,
    evaluate, parse_operand, operand_source, uses_vix, uses_usdinr)
from app.services.backtest import run_saved_backtest
from app.services.feed import Bar, RealMarketFeed
from app.services.history import HistoricalData
from app.services.currency_reference import pin_usdinr, reference_key
from tests.test_execution import payload, rule, setup
from tests.test_backtest import strategy, NOW, bars, load_rows
from tests.test_usdinr import REFERENCE


def candles(closes, first=0):
    return [dict(time=(i+first)*60, end=(i+first+1)*60, open=c, high=c+1,
                 low=max(.01, c-.5), close=c, volume=10+i, session='2026-10-15',
                 sessionFirst=i+first==0) for i,c in enumerate(closes)]


class ReferenceIndicatorTests(unittest.TestCase):
    def test_qualified_operand_validation_and_dependencies(self):
        self.assertEqual(parse_operand('RSI 14 @ VIX'), ('RSI', 14))
        self.assertEqual(parse_operand('EMA 9 @ USDINR'), ('EMA', 9))
        self.assertEqual(operand_source('Price @ VIX'), 'VIX')
        for invalid in ['RSI 14 @ UNKNOWN', 'VIX @ USDINR', 'RSI 14 @ VIX @ USDINR', '30 @ VIX']:
            with self.subTest(operand=invalid), self.assertRaises(ConditionError):
                parse_operand(invalid)
        s = strategy([rule('RSI 14 @ VIX', 'greater than', 'RSI 14 @ USDINR')])
        self.assertTrue(uses_vix(s))
        self.assertTrue(uses_usdinr(s))
        self.assertEqual(parse_operand('VIX'), ('VIX', 0))
        self.assertEqual(parse_operand('USDINR'), ('USDINR', 0))

    def test_every_registered_ohlcv_indicator_uses_reference_prices(self):
        reference = candles([20+i/4 for i in range(24)])
        target = candles([10000-i*10 for i in range(24)])
        source_indicators = [('Price', 'PRICE', 0), ('EMA 3', 'EMA', 3), ('SMA 3', 'SMA', 3),
                             ('RSI 3', 'RSI', 3), ('VWAP', 'VWAP', 0),
                             ('Supertrend', 'SUPERTREND', 10),
                             ('Opening Range High', 'OPENING RANGE HIGH', 0),
                             ('Opening Range Low', 'OPENING RANGE LOW', 0)]
        for source, attach in [('VIX', attach_vix), ('USDINR', attach_usdinr)]:
            for raw, name, period in source_indicators:
                with self.subTest(source=source, indicator=raw):
                    result = evaluate([rule(f'{raw} @ {source}', 'greater than', '0')], attach(target, reference))
                    self.assertAlmostEqual(result.conditions[0]['left'], REGISTRY[name](reference, period)[-1])
                    self.assertTrue(result.matched)

    def test_rsi_crossunder_thirty_uses_full_reference_warmup(self):
        reference = candles(list(range(20,35))+[1])
        # Only the final stock observations exist. Reference RSI still uses all 16.
        target = candles([100, 200], first=14)
        combined = attach_vix(target, reference)
        result = evaluate([rule('RSI 14 @ VIX', 'crosses below', '30')], combined)
        self.assertTrue(result.matched)
        self.assertEqual(result.conditions[0]['previousLeft'], 100)
        self.assertAlmostEqual(result.conditions[0]['left'], 28.26086956521739)
        changed_stock = [{**b, 'open': 999, 'high': 999, 'low': 999, 'close': 999} for b in combined]
        self.assertEqual(evaluate([rule('RSI 14 @ VIX', 'crosses below', '30')], changed_stock).conditions,
                         result.conditions)

    def test_both_comparison_sides_and_both_reference_sources(self):
        target = candles([100]*5)
        reference = candles([1,2,3,4,8])
        combined = attach_usdinr(attach_vix(target, reference), candles([20]*5))
        result = evaluate([rule('EMA 3 @ VIX', 'equals', '5.5'),
                           rule('20', 'equals', 'SMA 2 @ USDINR')], combined)
        self.assertTrue(result.matched)
        self.assertEqual(result.conditions[1]['right'], 20)
        self.assertEqual(result.conditions[0]['left'], 5.5)

    def test_missing_reference_does_not_forward_fill_and_restarts_after_gap(self):
        target = candles([100]*8)
        source = candles([20,21,22,23,24,25,26,27])
        source.pop(4)
        combined = attach_vix(target, source)
        rules = [rule('EMA 3 @ VIX', 'greater than', '0')]
        self.assertIsNone(evaluate(rules, combined, index=4).matched)
        self.assertIsNone(evaluate(rules, combined, index=5).matched)
        self.assertIsNone(evaluate(rules, combined, index=6).matched)
        self.assertTrue(evaluate(rules, combined, index=7).matched)
        # No crossing can compare two observations separated by a missing interval.
        gapped_target = [target[3], target[5]]
        self.assertIsNone(evaluate([rule('Price @ VIX', 'crosses above', '24')], attach_vix(gapped_target, source)).matched)

    def test_unavailable_volume_stays_unavailable_for_vwap(self):
        reference = candles([20,21])
        reference[0]['volume'] = 0
        reference[1]['volume'] = 0
        self.assertIsNone(evaluate([rule('VWAP @ VIX', 'greater than', '0')],
                                  attach_vix(candles([100,101]), reference)).matched)

    def test_cache_keeps_each_source_separate(self):
        combined = attach_usdinr(attach_vix(candles([100]*5), candles([1,2,3,4,8])), candles([90]*5))
        cache = {}
        result = evaluate([rule('EMA 3 @ VIX', 'less than', 'EMA 3 @ USDINR')], combined, cache=cache)
        self.assertTrue(result.matched)
        self.assertEqual(set(cache), {'EMA 3 @ VIX', 'EMA 3 @ USDINR'})


class ReferenceIndicatorExecutionTests(unittest.TestCase):
    def test_paper_buy_stock_when_reference_rsi_crosses_below_thirty(self):
        for source in ['VIX', 'USDINR']:
            with self.subTest(source=source):
                engine, tape = setup()
                config = payload([rule(f'RSI 14 @ {source}', 'crosses below', '30')])
                if source == 'USDINR': config.params.update(REFERENCE)
                saved = engine.create_strategy(config)
                key = 'INDIA VIX' if source == 'VIX' else reference_key(saved)
                tape.history[key] = []
                for i, value in enumerate(list(range(20,35))+[1]):
                    tick = tape.tick(101)
                    at = tick.bars['TCS'].time
                    tape.history[key].append(Bar(key, at, value, value, value, value, 100))
                    engine.on_tick(tick)
                    if i < 15: self.assertFalse(engine.positions)
                self.assertEqual([p['symbol'] for p in engine.positions], ['TCS'])
                self.assertEqual(engine.positions[0]['qty'], 7)
                self.assertLess(engine.runtime[saved['id']]['symbols']['TCS']['conditions'][0]['left'], 30)

    def test_backtest_buys_next_open_from_reference_rsi(self):
        for source in ['VIX', 'USDINR']:
            with self.subTest(source=source):
                saved = strategy([rule(f'RSI 14 @ {source}', 'crosses below', '30')])
                if source == 'USDINR': saved['params'].update(REFERENCE)
                closes = list(range(20,35))+[1,1]
                reference = bars('2026-10-15', [(c,c,c,c) for c in closes])
                # Distinct next-open price proves the signal cannot fill on its own candle.
                stock = bars('2026-10-15', [(101,101,101,101)]*(len(closes)-1)+[(105,105,105,105)])
                requested = []
                def loader(symbol, *args, **kwargs):
                    requested.append(symbol)
                    return load_rows(reference if symbol == 'INDIA VIX' or symbol.startswith('CDS:') else stock)(symbol,*args,**kwargs)
                result = run_saved_backtest(saved, 15, None, 0, 0, now=NOW, loader=loader)
                self.assertEqual(len(result['trades']), 1)
                self.assertEqual(result['trades'][0]['symbol'], 'TCS')
                self.assertEqual(result['trades'][0]['entry'], 105)
                self.assertEqual(result['trades'][0]['qty'], 7)
                self.assertTrue(any(s == 'INDIA VIX' or s.startswith('CDS:') for s in requested))
                # A minute closes at exactly the following minute's open; event order
                # and the distinct fill price above enforce causal next-candle execution.
                self.assertEqual(result['trades'][0]['signalTime'], '2026-10-15T09:31:00+05:30')
                self.assertEqual(result['trades'][0]['entryTime'], '2026-10-15T09:31:00+05:30')

    def test_reference_dependency_subscription_and_currency_pinning(self):
        saved = strategy([rule('RSI 14 @ VIX', 'less than', '30'), rule('EMA 3 @ USDINR','greater than','90')])
        saved['params'].update(REFERENCE)
        saved.update(status='running', timeframe='15m')
        with patch('app.services.currency_reference.request') as remote:
            pin_usdinr(saved)
            remote.assert_not_called()
        feed = RealMarketFeed()
        try:
            feed.set_symbols({'TCS'}, [saved])
            self.assertIn(('INDIA VIX', '15m'), feed.requests)
            self.assertIn((reference_key(saved), '1m'), feed.requests)
        finally:
            feed.close()
