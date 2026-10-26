"""Pin a USDINR futures contract so live and historical conditions use the same instrument."""
import csv
import io
from datetime import datetime, time
from zoneinfo import ZoneInfo
from app.services.option_chain import request, ChainError
from app.services.kite_backtest import get_access_token


def pin_usdinr(strategy):
    from app.services.conditions import uses_usdinr
    if not uses_usdinr(strategy):
        return
    now = datetime.now(ZoneInfo('Asia/Kolkata'))
    params = strategy['params']
    if params.get('usdinrSymbol') and params.get('usdinrToken') and params.get('usdinrExpiry', '') >= now.date().isoformat():
        return
    token = get_access_token()
    if not token:
        raise ChainError('Connect Zerodha before saving a USD/INR condition.', 401)
    rows = csv.DictReader(io.StringIO(request('/instruments/CDS', token).decode()))
    choices = [r for r in rows if r.get('name') == 'USDINR' and r.get('instrument_type') == 'FUT'
               and (r.get('expiry', '') > now.date().isoformat() or
                    (r.get('expiry') == now.date().isoformat() and now.time() < time(12, 30)))]
    if not choices:
        raise ChainError('No active USDINR futures contract was returned by Zerodha.', 503)
    selected = min(choices, key=lambda r: r['expiry'])
    params.update(usdinrSymbol=selected['tradingsymbol'], usdinrToken=int(selected['instrument_token']), usdinrExpiry=selected['expiry'])


def reference_key(strategy):
    p = strategy.get('params', {})
    if not p.get('usdinrSymbol') or not p.get('usdinrToken'):
        return None
    return f"CDS:{p['usdinrSymbol']}:{int(p['usdinrToken'])}"
