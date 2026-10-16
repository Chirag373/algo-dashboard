"""Pure, extensible OHLCV condition evaluation shared by validation and execution.

Indicators register series calculators; comparisons never need indicator-specific code.
Missing values use three-valued logic: a known true OR branch can match,
while an unknown required condition cannot create an entry. Mixed flat expressions use AND precedence over OR.
"""
import math
import re
from collections.abc import Callable
from dataclasses import dataclass

Series = list[float | None]
REGISTRY: dict[str, Callable[[list[dict], int], Series]] = {}
DEFAULT_PERIODS = {"EMA": 9, "SMA": 20, "RSI": 14, "SUPERTREND": 10}
OPERATORS = {"crosses above", "crosses below", "greater than", "less than", "is above", "is below", "equals", ">", "<", ">=", "<=", "==", "!=", "greater than or equal", "less than or equal"}


class ConditionError(ValueError):
    pass


def indicator(name):
    def register(fn):
        REGISTRY[name.upper()] = fn
        return fn
    return register


def parse_operand(raw: str) -> tuple[str, float | int]:
    raw = raw.strip()
    try:
        n = float(raw)
        if not math.isfinite(n):
            raise ConditionError("Constants must be finite")
        return "NUMBER", n
    except ValueError:
        if raw.lower() in {"nan", "inf", "-inf", "infinity"}:
            raise ConditionError("Constants must be finite") from None
    match = re.fullmatch(r"(EMA|SMA|RSI|Supertrend)\s*(?:\(?([0-9]+)\)?)?", raw, re.I)
    if match:
        name = match[1].upper()
        period = int(match[2]) if match[2] else DEFAULT_PERIODS[name]
        if not 1 <= period <= 500:
            raise ConditionError("Indicator period must be an integer from 1 to 500")
        return name, period
    name = raw.upper()
    name = {"CLOSE": "PRICE", "PRICE (CLOSE)": "PRICE", "LTP": "PRICE"}.get(name, name)
    if name not in REGISTRY:
        raise ConditionError(f"Unsupported indicator '{raw}'")
    return name, 0


def normalize_operator(op: str) -> str:
    op = op.lower().replace("_", " ").strip()
    op = {"crossover": "crosses above", "crossunder": "crosses below"}.get(op, op)
    if op not in OPERATORS:
        raise ConditionError(f"Unsupported comparison '{op}'")
    return op


def validate_rules(rules: list[dict], exit_rules=False):
    for rule in rules:
        # Legacy sentinel means only the engine's protective stops, never a condition.
        if exit_rules and rule["indicator"] == "Target / StopLoss" and rule["value"] == "Triggered":
            continue
        parse_operand(rule["indicator"])
        parse_operand(rule["value"])
        normalize_operator(rule["operator"])
        if rule.get("connector", "AND") not in {"AND", "OR"}:
            raise ConditionError("Condition connector must be AND or OR")


@indicator("Price")
def price(bars, period):
    return [b["close"] for b in bars]


@indicator("SMA")
def sma(bars, period):
    closes = price(bars, 0)
    out: Series = [None] * len(bars)
    total = 0.0
    for i, c in enumerate(closes):
        total += c
        if i >= period:
            total -= closes[i-period]
        if i >= period-1:
            out[i] = total / period
    return out


@indicator("EMA")
def ema(bars, period):
    out: Series = [None] * len(bars)
    if len(bars) >= period:
        value = sum(b["close"] for b in bars[:period]) / period
        out[period-1] = value
        for i in range(period, len(bars)):
            value += 2 / (period+1) * (bars[i]["close"] - value)
            out[i] = value
    return out


@indicator("RSI")
def rsi(bars, period):
    out: Series = [None] * len(bars)
    if len(bars) <= period:
        return out
    changes = [bars[i]["close"] - bars[i-1]["close"] for i in range(1, len(bars))]
    gain = sum(max(c, 0) for c in changes[:period]) / period
    loss = sum(max(-c, 0) for c in changes[:period]) / period
    def value():
        return 50.0 if gain == loss == 0 else (100.0 if loss == 0 else 100 - 100 / (1 + gain/loss))
    out[period] = value()
    for i in range(period+1, len(bars)):
        gain = (gain*(period-1) + max(changes[i-1], 0)) / period
        loss = (loss*(period-1) + max(-changes[i-1], 0)) / period
        out[i] = value()
    return out


@indicator("VWAP")
def vwap(bars, period):
    out: Series = []
    day, pv, volume = None, 0.0, 0.0
    for b in bars:
        if b["session"] != day:
            day, pv, volume = b["session"], (0.0 if b.get("sessionFirst") else math.nan), 0.0
        # A missing volume invalidates the remainder of this session.
        v = b.get("volume")
        if v is None or v < 0:
            pv = math.nan
        else:
            volume += v
            pv += (b["high"] + b["low"] + b["close"]) / 3 * v
        out.append(pv/volume if volume > 0 and math.isfinite(pv) else None)
    return out


def opening_range(bars, high):
    out: Series = []
    day, level = None, None
    for b in bars:
        if b["session"] != day:
            day = b["session"]
            # Require the first complete selected-timeframe session candle.
            level = b["high" if high else "low"] if b.get("sessionFirst") else None
        out.append(level)
    return out


indicator("Opening Range High")(lambda bars, _: opening_range(bars, True))
indicator("Opening Range Low")(lambda bars, _: opening_range(bars, False))


@indicator("Supertrend")
def supertrend(bars, period):
    """Wilder ATR(period), multiplier 3, initial direction bearish."""
    out: Series = [None] * len(bars)
    tr = [max(b["high"]-b["low"], abs(b["high"]-bars[i-1]["close"]), abs(b["low"]-bars[i-1]["close"])) if i else b["high"]-b["low"] for i, b in enumerate(bars)]
    if len(bars) < period:
        return out
    atr = sum(tr[:period])/period
    upper = lower = previous = None
    for i in range(period-1, len(bars)):
        if i >= period:
            atr = (atr*(period-1)+tr[i])/period
        mid = (bars[i]["high"]+bars[i]["low"])/2
        bu, bl = mid+3*atr, mid-3*atr
        if upper is None:
            upper, lower = bu, bl
            current = upper
        else:
            prev_upper, prev_lower = upper, lower
            upper = bu if bu < upper or bars[i-1]["close"] > upper else upper
            lower = bl if bl > lower or bars[i-1]["close"] < lower else lower
            if previous == prev_upper:
                current = upper if bars[i]["close"] <= upper else lower
            else:
                current = lower if bars[i]["close"] >= lower else upper
        out[i] = previous = current
    return out


@dataclass
class Evaluation:
    matched: bool | None
    conditions: list[dict]


def evaluate(rules: list[dict], bars: list[dict], *, index: int | None = None, cache: dict[str, Series] | None = None) -> Evaluation:
    cache = {} if cache is None else cache
    at = len(bars)-1 if index is None else index
    details = []
    for rule in rules:
        values = []
        for raw in (rule["indicator"], rule["value"]):
            if raw not in cache:
                name, period = parse_operand(raw)
                cache[raw] = [period] * len(bars) if name == "NUMBER" else REGISTRY[name](bars, int(period))
            values.append(cache[raw])
        left, right = values
        l, r = (left[at], right[at]) if at >= 0 else (None, None)
        pl, pr = (left[at-1], right[at-1]) if at >= 1 else (None, None)
        op = normalize_operator(rule["operator"])
        result = None
        if l is not None and r is not None:
            if op in {"crosses above", "crosses below"}:
                if pl is not None and pr is not None:
                    result = pl <= pr and l > r if op == "crosses above" else pl >= pr and l < r
            elif op in {"greater than", "is above", ">"}:
                result = l > r
            elif op in {"less than", "is below", "<"}:
                result = l < r
            elif op in {">=", "greater than or equal"}:
                result = l >= r
            elif op in {"<=", "less than or equal"}:
                result = l <= r
            else:
                equal = math.isclose(l, r, rel_tol=1e-10, abs_tol=1e-10)
                result = not equal if op == "!=" else equal
        details.append({**rule, "left": l, "right": r, "previousLeft": pl, "previousRight": pr, "matched": result})
    if not details:
        return Evaluation(None, details)
    def and_value(a, b):
        return False if a is False or b is False else (None if a is None or b is None else True)
    groups = [details[0]["matched"]]
    for d in details[1:]:
        if d.get("connector", "AND") == "OR":
            groups.append(d["matched"])
        else:
            groups[-1] = and_value(groups[-1], d["matched"])
    matched = True if any(g is True for g in groups) else (None if any(g is None for g in groups) else False)
    return Evaluation(matched, details)
