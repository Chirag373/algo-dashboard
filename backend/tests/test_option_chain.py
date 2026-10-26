import json
import unittest
from unittest.mock import patch
from app.services.option_chain import chain, ChainError


class OptionChainTests(unittest.TestCase):
    def test_missing_session(self):
        with patch('app.services.option_chain.get_access_token', return_value=''):
            with self.assertRaises(ChainError) as error:
                chain()
            self.assertEqual(error.exception.status, 401)

    def test_pairs_strikes_expiries_and_missing_quotes(self):
        rows = [dict(name='NIFTY', expiry=expiry, strike=strike, instrument_type=side,
                     tradingsymbol=f'{expiry}-{strike}-{side}', lot_size='75')
                for expiry in ['2026-11-01', '2026-11-08'] for strike in ['24000', '24100'] for side in ['CE', 'PE']]
        payload = dict(status='success', data={'NFO:2026-11-01-24000-CE': dict(last_price=100, oi=400, volume=50, depth=dict(buy=[dict(price=99)], sell=[dict(price=101)]), timestamp='2026-10-24 10:00:00')})
        with patch('app.services.option_chain.get_access_token', return_value='test'), patch('app.services.option_chain.contracts', return_value=rows), patch('app.services.option_chain.request', return_value=json.dumps(payload).encode()) as request:
            result = chain()
            self.assertEqual(result['expiry'], '2026-11-01')
            self.assertEqual(len(result['rows']), 2)
            self.assertEqual(result['rows'][0]['call']['ltp'], 100)
            self.assertEqual(result['rows'][0]['call']['bid'], 99)
            self.assertIsNone(result['rows'][0]['put']['ltp'])
            self.assertEqual(result['missingQuotes'], 3)
            self.assertEqual(request.call_args.args[0].count('i='), 5)
            self.assertEqual(chain(expiry='2026-11-08')['expiry'], '2026-11-08')
            with self.assertRaises(ChainError): chain(expiry='bad')

    def test_twenty_strikes_on_each_side_of_atm(self):
        rows = [dict(name='NIFTY', expiry='2026-11-01', strike=str(i), instrument_type='CE', tradingsymbol=f'C{i}', lot_size='75') for i in range(100)]
        payload = dict(status='success', data={'NSE:NIFTY 50': {'last_price': 50.2}})
        with patch('app.services.option_chain.get_access_token', return_value='test'), patch('app.services.option_chain.contracts', return_value=rows), patch('app.services.option_chain.request', return_value=json.dumps(payload).encode()):
            result = chain()
            self.assertEqual(result['atmStrike'], 50)
            self.assertEqual(len(result['rows']), 41)
            self.assertEqual(result['rows'][0]['strike'], 30)
            self.assertEqual(result['rows'][-1]['strike'], 70)

    def test_underlying_list_combines_all_exchanges(self):
        from app.services.option_chain import underlyings
        masters = {"NFO": [{"name": "NIFTY"}, {"name": "TCS"}, {"name": "RELIANCE"}, {"name": "TCS"}], "BFO": [{"name": "SENSEX"}, {"name": "BANKEX"}]}
        with patch('app.services.option_chain.get_access_token', return_value='test'), patch('app.services.option_chain.contracts', side_effect=lambda exchange, token: masters[exchange]):
            self.assertEqual(underlyings()['underlyings'], ['BANKEX', 'NIFTY', 'RELIANCE', 'SENSEX', 'TCS'])
