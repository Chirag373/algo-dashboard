import unittest
from unittest.mock import patch
from app.services import indian_assets


class IndianAssetsTests(unittest.TestCase):
    def test_indian_cash_equities_only_and_daily_cache(self):
        header = 'tradingsymbol,name,instrument_type,segment\n'
        sources = {'/instruments/NSE': (header+'TCS,Tata Consultancy,EQ,NSE\nNIFTYFUT,Nifty,FUT,NFO-FUT\n').encode(), '/instruments/BSE': (header+'TCS,Tata Consultancy,EQ,BSE\n').encode()}
        with patch.object(indian_assets, '_cache', None), patch.object(indian_assets, 'get_access_token', return_value='test'), patch.object(indian_assets, 'request', side_effect=lambda url, token: sources[url]) as fetch, patch.object(indian_assets, 'stock_classifications', return_value={'TCS': 'INE467B01029'}):
            rows = indian_assets.assets()
            self.assertEqual([r['symbol'] for r in rows], ['TCS'])
            self.assertEqual([r['exchange'] for r in rows], ['NSE'])
            indian_assets.assets()
            self.assertEqual(fetch.call_count, 2)

    def test_classifier_excludes_funds_bonds_and_other_securities(self):
        import gzip, json
        rows = [
            dict(trading_symbol='TCS', isin='INE467B01029', segment='NSE_EQ', instrument_type='EQ'),
            dict(trading_symbol='ETF', isin='INF204KB17I5', segment='NSE_EQ', instrument_type='EQ'),
            dict(trading_symbol='BOND', isin='INE467B07029', segment='NSE_EQ', instrument_type='EQ'),
            dict(trading_symbol='TBILL', isin='IN0020260014', segment='NSE_EQ', instrument_type='EQ'),
            dict(trading_symbol='PREF', isin='INE467B04029', segment='NSE_EQ', instrument_type='EQ'),
        ]
        with patch('urllib.request.urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = gzip.compress(json.dumps(rows).encode())
            self.assertEqual(indian_assets.stock_classifications('NSE'), {'TCS': 'INE467B01029'})
