"""Deterministic Forward Put Builder tests; no external market APIs or real orders."""
import copy
import unittest
from concurrent.futures import Future
from datetime import datetime, timedelta
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.api.routes import router
from app.schemas import StrategyIn
from app.services.hub import Hub
from app.services.backtest import run_saved_backtest
from app.services.forward_put import ForwardPutMarket, enabled, fetch_snapshot, option_quote, select_contract, selection_key
from app.services.history import HistoryError
from app.services.option_chain import ChainError
from tests.test_execution import START, payload, setup, rule

SYMBOL = 'NFO:TCS26DEC250PE'


def master(expiries=None):
    return [dict(name='TCS', expiry=expiry, strike=str(strike), instrument_type=kind,
                 tradingsymbol=f'TCS-{expiry}-{strike}-{kind}', lot_size='25', instrument_token='42')
            for expiry in (expiries or ['2026-12-14', '2027-01-13'])
            for strike in range(100, 400, 10) for kind in ['CE', 'PE']]


def config():
    data = payload().model_dump()
    data['params'].update(executionAction='forward_put', optionLots=2)
    return StrategyIn.model_validate(data)


class ForwardSelectionTests(unittest.TestCase):
    def test_earliest_expiry_and_fifteenth_strictly_higher_distinct_put(self):
        rows = master(['2026-11-01', '2026-12-14', '2027-01-13', '2027-01-14'])
        chosen = select_contract(list(reversed(rows)), 'TCS', 100, START.date())
        self.assertEqual(chosen['expiry'], '2026-12-14')  # exactly 60 days
        self.assertEqual(chosen['strike'], 250)
        self.assertEqual(chosen['lotSize'], 25)
        self.assertTrue(chosen['tradingsymbol'].endswith('-PE'))
        self.assertEqual(select_contract(rows+rows, 'TCS', 110, START.date())['strike'], 260)
        self.assertEqual(select_contract(master(['2027-01-13']), 'TCS', 100, START.date())['expiry'], '2027-01-13')  # exactly 90 days
        aliases = [dict(r, name='NIFTY') for r in rows]
        self.assertEqual(select_contract(aliases, 'NIFTY 50', 100, START.date())['strike'], 250)

    def test_calendar_month_choices_earliest_active_expiry_and_year_rollover(self):
        rows = master(['2026-10-01', '2026-10-22', '2026-10-29', '2026-11-05', '2026-12-31'])
        for months, expiry in [(0, '2026-10-22'), (1, '2026-11-05'), (2, '2026-12-31')]:
            with self.subTest(months=months):
                self.assertEqual(select_contract(rows, 'TCS', 100, START.date(), months)['expiry'], expiry)
        december = START.date().replace(month=12, day=20)
        rows = master(['2026-12-31', '2027-01-07', '2027-02-25'])
        self.assertEqual(select_contract(rows, 'TCS', 100, december, 1)['expiry'], '2027-01-07')
        self.assertEqual(select_contract(rows, 'TCS', 100, december, 2)['expiry'], '2027-02-25')
        with self.assertRaisesRegex(ChainError, '2026-11'):
            select_contract(master(['2026-12-31']), 'TCS', 100, START.date(), 1)

    def test_month_validation_and_legacy_rule_preserved(self):
        self.assertNotIn('optionExpiryMonths', config().params)
        for value in [0, 1, 2]:
            data = config().model_dump()
            data['params']['optionExpiryMonths'] = value
            self.assertEqual(StrategyIn.model_validate(data).params['optionExpiryMonths'], value)
        for value in [-1, 3, True, 1.5, '1', None]:
            data = config().model_dump()
            data['params']['optionExpiryMonths'] = value
            with self.subTest(value=value), self.assertRaises(ValidationError): StrategyIn.model_validate(data)

    def test_multiple_expiry_horizons_for_same_underlying_remain_separate(self):
        rows = master(['2026-10-22', '2026-11-05'])
        raw = dict(timestamp=START.isoformat(), depth=dict(buy=[dict(price=10, quantity=100)], sell=[dict(price=11, quantity=100)]))
        with patch('app.services.forward_put.datetime', wraps=datetime) as clock, \
                patch('app.services.forward_put.get_access_token', return_value='test'), \
                patch('app.services.forward_put.contracts', return_value=rows), \
                patch('app.services.forward_put._quotes') as quotes:
            clock.now.return_value = START
            current = 'NFO:TCS-2026-10-22-250-PE'
            next_month = 'NFO:TCS-2026-11-05-250-PE'
            quotes.side_effect = [{'NSE:TCS': dict(timestamp=START.isoformat(), last_price=100)}, {current: raw, next_month: raw}]
            choices, values, errors = fetch_snapshot({('TCS', 0), ('TCS', 1)}, [])
            self.assertEqual(choices[selection_key('TCS', 0)]['symbol'], current)
            self.assertEqual(choices[selection_key('TCS', 1)]['symbol'], next_month)
            self.assertFalse(errors)
            self.assertEqual(set(values), {current, next_month})

    def test_no_expiry_or_fifteenth_strike_never_substitutes(self):
        for rows, symbol, spot in [(master(['2026-11-01']), 'TCS', 100), (master(), 'TCS', 300),
                (master(), 'INFY', 100), (master(), 'TCS', float('nan'))]:
            with self.subTest(symbol=symbol, spot=spot), self.assertRaises(ChainError):
                select_contract(rows, symbol, spot, START.date())

    def test_quote_staleness_missing_depth_and_exit_without_bid(self):
        raw = dict(timestamp=START.isoformat(), depth=dict(buy=[dict(price=10, quantity=100)], sell=[dict(price=11, quantity=100)]))
        self.assertEqual(option_quote(raw, START)['bid'], 10)
        for now in [START+timedelta(seconds=121), START-timedelta(seconds=1)]:
            with self.assertRaises(ChainError): option_quote(raw, now)
        raw['depth']['buy'] = []
        self.assertIsNone(option_quote(raw, START)['bid'])
        raw['depth']['sell'][0]['price'] = 0
        with self.assertRaises(ChainError): option_quote(raw, START)

    def test_fetch_requests_real_spot_and_selected_and_held_contracts_only(self):
        with patch('app.services.forward_put.datetime', wraps=datetime) as clock, \
                patch('app.services.forward_put.get_access_token', return_value='test'), \
                patch('app.services.forward_put.contracts', return_value=master()), \
                patch('app.services.forward_put._quotes') as quotes:
            clock.now.return_value = START
            raw = dict(timestamp=START.isoformat(), depth=dict(buy=[dict(price=10, quantity=100)], sell=[dict(price=11, quantity=100)]))
            selected_key = 'NFO:TCS-2026-12-14-250-PE'
            quotes.side_effect = [{'NSE:TCS': dict(timestamp=START.isoformat(), last_price=100)},
                                 {selected_key: raw, 'NFO:HELDPE': raw}]
            choices, values, errors = fetch_snapshot({'TCS'}, [dict(symbol='NFO:HELDPE')])
            self.assertEqual(choices['TCS']['symbol'], selected_key)
            self.assertEqual(set(values), {selected_key, 'NFO:HELDPE'})
            self.assertFalse(errors)
            self.assertEqual(set(quotes.call_args.args[0]), {selected_key, 'NFO:HELDPE'})

    def test_worker_failure_clears_cached_choices_and_quotes(self):
        market = ForwardPutMarket()
        try:
            market.choices, market.quotes = {'TCS': {}}, {SYMBOL: {}}
            market.job = Future()
            market.job.set_exception(ChainError('Session expired'))
            market.poll([], [])
            self.assertFalse(market.choices)
            self.assertFalse(market.quotes)
            self.assertEqual(market.error, 'Session expired')
        finally:
            market.close()


class ForwardExecutionTests(unittest.TestCase):
    def setUp(self):
        self.engine, self.tape = setup()
        self.tape.kind = 'real_market'
        self.market = ForwardPutMarket()
        self.engine.option_market = self.market
        self.addCleanup(self.market.close)
        self.market.choices['TCS'] = dict(symbol=SYMBOL, exchange='NFO', expiry='2026-12-14',
            strike=250, lotSize=25, instrumentToken=42, underlying='TCS', spot=101, receivedAt=START.timestamp())

    def tick(self, spot=101, ask=10.1, bid=10, bid_qty=100, ask_qty=100, stale=False):
        tick = self.tape.tick(spot)
        now = self.tape.now.timestamp() - (200 if stale else 0)
        self.market.choices['TCS']['receivedAt'] = now
        self.market.quotes[SYMBOL] = dict(bid=bid, ask=ask, bidQuantity=bid_qty,
            askQuantity=ask_qty, timestamp=now, receivedAt=now)
        self.engine.on_tick(tick)
        return tick

    def test_api_save_lots_short_once_stop_gap_and_buyback(self):
        app = FastAPI()
        app.state.engine = self.engine
        app.state.hub = Hub()
        app.include_router(router, prefix='/api/v1')
        with TestClient(app) as client:
            response = client.post('/api/v1/strategies', json=config().model_dump())
            self.assertEqual(response.status_code, 201, response.text)
            self.assertTrue(enabled(self.engine.strategies[-1]))
            self.tick()
            position = self.engine.positions[0]
            self.assertEqual((position['symbol'], position['side'], position['qty']), (SYMBOL, 'SELL', 50))
            self.assertEqual(position['underlying'], 'TCS')
            self.assertEqual(position['avg'], 10)
            self.assertEqual(position['reservedCapital'], 12500)
            self.assertEqual(position['sl'], 10.1)
            self.assertEqual(position['target'], 9.8)
            self.tick(ask=10.05)
            self.assertEqual(len(self.engine.positions), 1)
            self.tick(ask=10.2)
            self.assertFalse(self.engine.positions)
            trade = self.engine.db.recent_trades(1)[0]
            self.assertEqual(trade['exit'], 10.2)
            self.assertAlmostEqual(trade['pnl'], -10)
            self.tick()
            self.assertFalse(self.engine.positions)
            self.assertEqual([o['side'] for o in reversed(self.engine.db.recent_orders(10))], ['SELL', 'BUY'])

    def test_target_protection_while_stopped_and_bid_missing(self):
        saved = self.engine.create_strategy(config())
        self.tick()
        self.engine.set_strategy_status(saved['id'], 'stopped')
        self.tick(ask=9.7, bid=None)
        self.assertFalse(self.engine.positions)
        self.assertEqual(self.engine.db.recent_trades(1)[0]['exit'], 9.7)

    def test_optional_exit_uses_underlying_signal_but_option_ask(self):
        data = config().model_dump()
        data['exitRules'] = [rule('Price', 'less than', '100')]
        self.engine.create_strategy(StrategyIn.model_validate(data))
        self.tick()
        self.tick(spot=99, ask=10.05)
        self.assertFalse(self.engine.positions)
        self.assertEqual(self.engine.db.recent_trades(1)[0]['exit'], 10.05)

    def test_stale_illiquid_quotes_and_capital_rejection(self):
        self.engine.create_strategy(config())
        self.tick(stale=True)
        self.assertFalse(self.engine.positions)
        self.tick(spot=99)
        self.tick(bid_qty=10)
        self.assertFalse(self.engine.positions)
        self.tick(spot=99)
        self.engine.risk['maxCapitalPerTrade'] = 1000
        self.tick()
        self.assertFalse(self.engine.positions)
        self.assertEqual(self.engine.db.recent_orders(1)[0]['side'], 'SELL')
        self.assertIn('capital', self.engine.db.recent_orders(1)[0]['note'])

    def test_stale_exit_waits_restart_preserves_position_and_latch(self):
        saved = self.engine.create_strategy(config())
        self.tick()
        position = copy.deepcopy(self.engine.positions[0])
        self.tick(stale=True, ask=15)
        self.assertEqual(self.engine.positions[0]['id'], position['id'])
        reopened, _ = setup(self.engine.db)
        self.assertEqual(reopened.positions[0]['symbol'], SYMBOL)
        self.assertTrue(reopened.runtime[saved['id']]['symbols']['TCS']['matched'])
        self.assertEqual(reopened.positions[0]['reservedCapital'], 12500)

    def test_pause_simulated_feed_and_schema_validation(self):
        saved = self.engine.create_strategy(config())
        self.engine.set_strategy_status(saved['id'], 'paused')
        self.tick()
        self.assertFalse(self.engine.positions)
        for lots in [0, -1, 1.5, True, 1001, '2']:
            data = config().model_dump()
            data['params']['optionLots'] = lots
            with self.subTest(lots=lots), self.assertRaises(ValidationError): StrategyIn.model_validate(data)
        self.engine.set_strategy_status(saved['id'], 'running')
        self.tick(spot=99)
        self.tape.kind = 'simulated'
        self.tick()
        self.assertFalse(self.engine.positions)

    def test_entry_uses_saved_month_choice_instead_of_legacy_cache(self):
        data = config().model_dump()
        data['params']['optionExpiryMonths'] = 0
        self.engine.create_strategy(StrategyIn.model_validate(data))
        self.market.choices[selection_key('TCS', 0)] = dict(self.market.choices['TCS'],
            expiry='2026-10-22', receivedAt=(START+timedelta(minutes=1)).timestamp())
        self.tick()
        self.assertEqual(self.engine.positions[0]['expiry'], '2026-10-22')
        self.assertEqual(self.engine.positions[0]['expiryMonths'], 0)

    def test_daily_square_off_and_fees_use_held_option_ask(self):
        self.engine.broker.fee_per_order = 20
        self.engine.create_strategy(config())
        self.tick()
        self.tape.index = 360  # first quote after the saved 15:15 daily cutoff
        self.tick(ask=10.05)
        self.assertFalse(self.engine.positions)
        trade = self.engine.db.recent_trades(1)[0]
        self.assertEqual(trade['reason'], 'Strategy square-off')
        self.assertEqual(trade['fees'], 40)
        self.assertAlmostEqual(trade['pnl'], -42.5)

    def test_held_cash_reserve_counts_against_other_entries(self):
        self.engine.create_strategy(config())
        self.tick()
        self.engine.risk['totalCapital'] = 12510
        self.assertEqual(self.engine._risk_reject_reason('TCS', 1, 101), 'Exceeds total capital')

    def test_ask_depth_blocks_exit_without_fabricating_fill(self):
        saved = self.engine.create_strategy(config())
        self.tick()
        self.engine.set_strategy_status(saved['id'], 'stopped')
        self.tick(ask=11, ask_qty=1)
        self.assertEqual(len(self.engine.positions), 1)
        self.tick(ask=11, ask_qty=100)
        self.assertFalse(self.engine.positions)

    def test_backtest_refuses_underlying_substitution(self):
        with patch('app.services.backtest.fetch_history') as loader:
            with self.assertRaisesRegex(HistoryError, 'historical option-chain'):
                run_saved_backtest(config().model_dump(), 30, None, 0, 0, loader=loader)
            loader.assert_not_called()
