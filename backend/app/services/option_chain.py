"""Read-only option chain assembled from Kite instruments and full quotes."""
import csv
import gzip
import io
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from app.core.config import settings
from app.services.kite_backtest import get_access_token


class ChainError(ValueError):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


_lock = threading.Lock()
_master = {}


def request(path, token):
    req = urllib.request.Request("https://api.kite.trade" + path, headers={
        "X-Kite-Version": "3", "Authorization": f"token {settings.KITE_API_KEY}:{token}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            return gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise ChainError("Zerodha session expired or market-data access is unavailable. Reconnect Zerodha.", 401) from None
        if exc.code == 429:
            raise ChainError("Zerodha rate limit reached. Please retry shortly.", 429) from None
        raise ChainError("Zerodha could not provide option-chain data. Please retry.") from None
    except (OSError, ValueError):
        raise ChainError("Unable to reach Zerodha. Please retry.") from None


def contracts(exchange, token):
    with _lock:
        cached = _master.get(exchange)
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
        if cached and cached[0] == today:
            return cached[1]
        raw = request(f"/instruments/{exchange}", token)
        rows = [r for r in csv.DictReader(io.StringIO(raw.decode()))
                if r.get("instrument_type") in {"CE", "PE"} and r.get("expiry", "") >= today]
        _master[exchange] = (today, rows)
        return rows


def underlyings():
    token = get_access_token()
    if not token:
        raise ChainError("Connect Zerodha to load option underlyings.", 401)
    names = {r["name"] for exchange in ["NFO", "BFO"]
             for r in contracts(exchange, token) if r.get("name")}
    return {"underlyings": sorted(names)}


def chain(symbol="NIFTY", expiry=None):
    token = get_access_token()
    if not token:
        raise ChainError("Connect Zerodha to view its option chain.", 401)
    symbol = symbol.upper().strip()
    exchange = "BFO" if symbol in {"SENSEX", "BANKEX"} else "NFO"
    rows = contracts(exchange, token)
    if not any(r.get("name") == symbol for r in rows) and exchange == "NFO":
        exchange = "BFO"
        rows = contracts(exchange, token)
    underlyings = sorted({r["name"] for r in rows if r.get("name")})
    selected = [r for r in rows if r.get("name") == symbol]
    expiries = sorted({r["expiry"] for r in selected})
    if not expiries:
        raise ChainError("No active option contracts found for this underlying.", 404)
    expiry = expiry or expiries[0]
    if expiry not in expiries:
        raise ChainError("This expiry is unavailable. Select an active expiry.", 400)
    selected = [r for r in selected if r["expiry"] == expiry]
    spot_key = {"NIFTY": "NSE:NIFTY 50", "BANKNIFTY": "NSE:NIFTY BANK",
                "FINNIFTY": "NSE:NIFTY FIN SERVICE", "MIDCPNIFTY": "NSE:NIFTY MID SELECT",
                "SENSEX": "BSE:SENSEX", "BANKEX": "BSE:BANKEX"}.get(symbol, f"{'BSE' if exchange == 'BFO' else 'NSE'}:{symbol}")
    quotes = {}
    for offset in range(0, len(selected), 400):
        if offset:
            time.sleep(1.05)
        keys = [("i", f"{exchange}:{r['tradingsymbol']}") for r in selected[offset:offset+400]]
        if offset == 0:
            keys.append(("i", spot_key))
        payload = json.loads(request("/quote?" + urllib.parse.urlencode(keys), token))
        if payload.get("status") != "success":
            raise ChainError("Zerodha did not return valid market quotes.")
        quotes.update(payload.get("data", {}))
    strikes = {}
    missing = 0
    for contract in selected:
        strike = float(contract["strike"])
        row = strikes.setdefault(strike, {"strike": strike, "call": None, "put": None})
        quote = quotes.get(f"{exchange}:{contract['tradingsymbol']}")
        if quote is None:
            missing += 1
        depth = (quote or {}).get("depth", {})
        def best(side):
            levels = depth.get(side, [])
            return levels[0].get("price") if levels else None
        row["call" if contract["instrument_type"] == "CE" else "put"] = {
            "symbol": contract["tradingsymbol"], "lotSize": int(contract["lot_size"]),
            "ltp": (quote or {}).get("last_price"), "oi": (quote or {}).get("oi"),
            "volume": (quote or {}).get("volume"), "bid": best("buy"), "ask": best("sell"),
            "timestamp": (quote or {}).get("timestamp")}
    spot = quotes.get(spot_key, {}).get("last_price")
    ordered = [strikes[k] for k in sorted(strikes)]
    atm = min(strikes, key=lambda strike: abs(strike - spot)) if spot and strikes else None
    if atm is not None:
        index = next(i for i, row in enumerate(ordered) if row["strike"] == atm)
        ordered = ordered[max(0, index - 20):index + 21]
    return {"spot": spot, "atmStrike": atm, "symbol": symbol, "exchange": exchange, "expiry": expiry, "expiries": expiries,
            "underlyings": underlyings, "rows": ordered,
            "missingQuotes": missing, "updatedAt": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()}
