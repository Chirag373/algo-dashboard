"""Read-only Kite selection and quote worker for Forward Put Builder paper trades."""
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from app.services.kite_backtest import get_access_token
from app.services.option_chain import ChainError, contracts, request

ACTION = "forward_put"
IST = ZoneInfo("Asia/Kolkata")
ALIASES = {"NIFTY 50": "NIFTY", "NIFTY BANK": "BANKNIFTY"}
SPOTS = {"NIFTY": "NSE:NIFTY 50", "BANKNIFTY": "NSE:NIFTY BANK",
         "FINNIFTY": "NSE:NIFTY FIN SERVICE", "MIDCPNIFTY": "NSE:NIFTY MID SELECT",
         "SENSEX": "BSE:SENSEX", "BANKEX": "BSE:BANKEX"}


def enabled(strategy):
    return strategy.get("params", {}).get("executionAction") == ACTION


def selection_key(symbol, months=None):
    return symbol if months is None else f"{symbol}@month:{months}"


def select_contract(rows, symbol, spot, today, months=None):
    """Count distinct listed PE strikes strictly above spot; never round to ATM."""
    symbol = ALIASES.get(symbol, symbol)
    if not math.isfinite(spot) or spot <= 0:
        raise ChainError("Underlying price is unavailable.")
    puts = [r for r in rows if r.get("name") == symbol and r.get("instrument_type") == "PE"]
    if months is None:  # Preserve existing saved strategies' original 60–90 day rule.
        eligible = sorted({r["expiry"] for r in puts
                           if 60 <= (date.fromisoformat(r["expiry"]) - today).days <= 90})
        missing = "No put expiry 60–90 days away. Entry skipped."
    else:
        if type(months) is not int or months not in (0, 1, 2):
            raise ChainError("Expiry month must be this month, next month, or 2 months forward.")
        month_index = today.year * 12 + today.month - 1 + months
        year, month = divmod(month_index, 12)
        eligible = sorted({r["expiry"] for r in puts
                           if (expiry_date := date.fromisoformat(r["expiry"])) >= today
                           and (expiry_date.year, expiry_date.month) == (year, month + 1)})
        missing = f"No active put expiry in {year:04d}-{month + 1:02d}. Entry skipped."
    if not eligible:
        raise ChainError(missing)
    expiry = eligible[0]
    puts = [r for r in puts if r["expiry"] == expiry and float(r["strike"]) > spot]
    strikes = sorted({float(r["strike"]) for r in puts})
    if len(strikes) < 15:
        raise ChainError("Fewer than 15 listed put strikes above spot for the selected expiry. Entry skipped.")
    selected = next(r for r in puts if float(r["strike"]) == strikes[14])
    lot_size = int(selected["lot_size"])
    if lot_size <= 0:
        raise ChainError("Contract lot size is unavailable.")
    return {"tradingsymbol": selected["tradingsymbol"], "expiry": expiry,
            "strike": strikes[14], "lotSize": lot_size, "spot": spot,
            "instrumentToken": int(selected["instrument_token"])}


def quote_time(quote, now):
    try:
        stamp = datetime.fromisoformat(quote["timestamp"])
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=IST)
        age = now.timestamp() - stamp.timestamp()
        if not 0 <= age <= 120:
            raise ValueError()
        return stamp.timestamp()
    except (KeyError, TypeError, ValueError):
        raise ChainError("Waiting for a fresh exchange quote (maximum age 120 seconds).") from None


def option_quote(raw, now):
    stamp = quote_time(raw, now)
    try:
        ask = float(raw["depth"]["sell"][0]["price"])
        ask_qty = int(raw["depth"]["sell"][0]["quantity"])
        if not math.isfinite(ask) or ask <= 0 or ask_qty <= 0:
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError):
        raise ChainError("Waiting for an option ask with available quantity.") from None
    # An absent bid blocks entries, but must not prevent buying back a held put.
    bid, bid_qty = None, 0
    try:
        value = float(raw["depth"]["buy"][0]["price"])
        quantity = int(raw["depth"]["buy"][0]["quantity"])
        if math.isfinite(value) and 0 < value <= ask and quantity > 0:
            bid, bid_qty = value, quantity
    except (KeyError, IndexError, TypeError, ValueError):
        pass
    return {"bid": bid, "ask": ask, "bidQuantity": bid_qty, "askQuantity": ask_qty,
            "timestamp": stamp, "receivedAt": now.timestamp()}


def _quotes(keys, token):
    result = {}
    keys = sorted(set(keys))
    for offset in range(0, len(keys), 400):
        if offset:
            time.sleep(1.05)
        data = json.loads(request("/quote?" + urlencode([("i", key) for key in keys[offset:offset+400]]), token))
        if data.get("status") != "success":
            raise ChainError("Kite did not return valid option quotes.")
        result.update(data.get("data", {}))
    return result


def fetch_snapshot(symbols, positions):
    token = get_access_token()
    if not token:
        raise ChainError("Connect Kite to run Forward Put Builder.", 401)
    choices, errors = {}, {}
    now = datetime.now(IST)
    selections = {(item, None) if isinstance(item, str) else item for item in symbols}
    spot_keys = {s: SPOTS.get(ALIASES.get(s, s), f"NSE:{s}") for s, _ in selections}
    spots = _quotes(spot_keys.values(), token) if symbols else {}
    for symbol, months in selections:
        key = selection_key(symbol, months)
        try:
            raw = spots.get(spot_keys[symbol], {})
            quote_time(raw, now)
            exchange = "BFO" if symbol in {"SENSEX", "BANKEX"} else "NFO"
            selected = select_contract(contracts(exchange, token), symbol, float(raw.get("last_price", 0)), now.date(), months)
            selected.update(symbol=f"{exchange}:{selected['tradingsymbol']}", exchange=exchange,
                            underlying=symbol, expiryMonths=months, receivedAt=now.timestamp())
            choices[key] = selected
        except (ChainError, ValueError, KeyError) as exc:
            errors[key] = str(exc)
    # Track held contracts even if the strategy is stopped or today's selection changed.
    keys = {c["symbol"] for c in choices.values()} | {p["symbol"] for p in positions}
    raw_quotes = _quotes(keys, token) if keys else {}
    quotes = {}
    for key in keys:
        try:
            quotes[key] = option_quote(raw_quotes.get(key, {}), datetime.now(IST))
        except ChainError as exc:
            for underlying, contract in choices.items():
                if contract["symbol"] == key:
                    errors[underlying] = str(exc)
    return choices, quotes, errors


class ForwardPutMarket:
    """Only the worker uses network I/O; the engine reads bounded-age snapshots."""
    def __init__(self):
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="forward-put-quotes")
        self.job = None
        self.last_poll = 0
        self.choices, self.quotes, self.errors = {}, {}, {}
        self.error = "Waiting for Forward Put Builder quotes."

    def poll(self, strategies, positions):
        if self.job and self.job.done():
            try:
                self.choices, self.quotes, self.errors = self.job.result()
                self.error = "Waiting for matching forward put quotes."
            except Exception as exc:
                self.choices, self.quotes, self.errors = {}, {}, {}
                self.error = str(exc)
            self.job = None
        from app.services.engine import TradingEngine
        symbols = {(sym, s["params"].get("optionExpiryMonths")) for s in strategies if enabled(s) and s["status"] == "running"
                   for sym in TradingEngine._universe(s["instrument"], s.get("instruments"))}
        held = [dict(p) for p in positions if p.get("executionAction") == ACTION]
        if (symbols or held) and self.job is None and time.monotonic() - self.last_poll >= 5:
            self.last_poll = time.monotonic()
            self.job = self.pool.submit(fetch_snapshot, symbols, held)

    def quote(self, symbol, now):
        value = self.quotes.get(symbol)
        if value and 0 <= now.timestamp() - value["receivedAt"] <= 15 and 0 <= now.timestamp() - value["timestamp"] <= 120:
            return value
        return None

    def selection(self, symbol, now, months=None):
        choice = self.choices.get(selection_key(symbol, months))
        if choice and 0 <= now.timestamp() - choice["receivedAt"] <= 15 and self.quote(choice["symbol"], now) and self.quote(choice["symbol"], now).get("bid"):
            return choice
        return None

    def close(self):
        self.pool.shutdown(wait=False, cancel_futures=True)
