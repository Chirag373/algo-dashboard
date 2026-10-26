import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError, HTTPError
from fastapi import HTTPException
from app.services import kite_backtest as kite
from app.api.kite_routes import kite_status


class KiteSessionTests(unittest.TestCase):
    def test_survives_restart_and_logout_removes_file(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(kite, '_TOKEN_PATH', Path(directory)/'.session'), patch.object(kite, '_ACCESS_TOKEN', ''), patch.object(kite.settings, 'KITE_ACCESS_TOKEN', ''):
            kite.set_access_token('test-session')
            self.assertEqual(kite._TOKEN_PATH.stat().st_mode & 0o777, 0o600)
            kite._ACCESS_TOKEN = ''
            kite.settings.KITE_ACCESS_TOKEN = ''
            self.assertEqual(kite.get_access_token(), 'test-session')
            kite.set_access_token('')
            self.assertFalse(kite._TOKEN_PATH.exists())

    def test_transient_failure_preserves_session(self):
        with patch.object(kite, 'get_access_token', return_value='test'), patch('urllib.request.urlopen', side_effect=URLError('offline')), patch.object(kite, 'set_access_token') as clear:
            with self.assertRaises(HTTPException) as error:
                kite_status()
            self.assertEqual(error.exception.status_code, 503)
            clear.assert_not_called()

    def test_invalid_token_clears_session(self):
        with patch.object(kite, 'get_access_token', return_value='test'), patch('urllib.request.urlopen', side_effect=HTTPError('https://api.kite.trade/user/profile', 403, '', {}, None)), patch.object(kite, 'set_access_token') as clear:
            self.assertFalse(kite_status()['connected'])
            clear.assert_called_once_with('')
