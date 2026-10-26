"""Daily cached Indian cash equity instrument catalogue from Zerodha."""
import csv
import io
import gzip
import json
import urllib.request
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
from app.services.option_chain import request, ChainError
from app.services.kite_backtest import get_access_token

_lock = threading.Lock()
_cache = None


def stock_classifications(exchange):
    # Public security classification only. Broker credentials are never sent here.
    url = f'https://assets.upstox.com/market-quote/instruments/exchange/{exchange}.json.gz'
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            rows = json.loads(gzip.decompress(response.read()))
    except (OSError, ValueError):
        raise ChainError('Unable to verify stock classifications. Please retry.', 503) from None
    allowed = {'EQ', 'BE', 'BZ', 'SM', 'ST', 'SZ'} if exchange == 'NSE' else {'A', 'B', 'T', 'X', 'XT', 'M', 'MT', 'TS', 'Z', 'ZP', 'P'}
    return {r['trading_symbol']: r['isin'] for r in rows
            if r.get('segment') == f'{exchange}_EQ' and r.get('instrument_type') in allowed
            and r.get('isin', '').startswith('INE') and r['isin'][8:10] == '10'}


def assets():
    global _cache
    today = datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat()
    if _cache and _cache[0] == today:
        return _cache[1]
    token = get_access_token()
    if not token:
        raise ChainError('Connect Zerodha to load the full Indian stock list.', 401)
    with _lock:
        if _cache and _cache[0] == today:
            return _cache[1]
        result = {}
        seen_isins = set()
        for exchange in ['NSE', 'BSE']:
            classifications = stock_classifications(exchange)
            rows = csv.DictReader(io.StringIO(request(f'/instruments/{exchange}', token).decode()))
            for row in rows:
                if row.get('instrument_type') != 'EQ' or row.get('segment') != exchange:
                    continue
                name = row.get('name', '').strip()
                symbol = row.get('tradingsymbol', '').strip()
                isin = classifications.get(symbol)
                if not name or not symbol or not isin or isin in seen_isins:
                    continue
                seen_isins.add(isin)
                value = symbol if exchange == 'NSE' else symbol + '.BO'
                result[value] = dict(symbol=value, name=name, exchange=exchange, tradable=True)
        records = sorted(result.values(), key=lambda r: (r['exchange'] != 'NSE', r['symbol']))
        _cache = (today, records)
        return records
