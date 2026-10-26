import re
import math

from app.services.candles import timeframe_minutes
from app.services.conditions import validate_rules
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Template = Literal["ORB", "FinBaba", "Custom"]
Stage = Literal["Draft", "Backtest", "Paper", "Live"]
Status = Literal["running", "paused", "stopped"]

TIMEFRAMES = {"1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240}
INSTRUMENTS = [
    "NIFTY",
    "BANKNIFTY",
    "NIFTY 50 Stocks",
    "Custom Watchlist",
    "NIFTY 50",
    "Stocks",
    "Options",
]

# key -> (min, max) for numeric params; "time" for HH:MM; "level" for L0-L4
PARAM_RULES: dict[str, dict[str, Any]] = {
    "ORB": {
        "rangeCandleCount": (1, 30),
        "initialSlPercent": (0.1, 20),
        "tslLockPercent": (0, 20),
        "tslTrailStep": (0, 10),
        "perTradeAmount": (100, None),
        "maxTradesPerStock": (1, 20),
        "squareOffTime": "time",
    },
    "FinBaba": {
        "isl": (1, None),
        "csl": (1, None),
        "level": "level",
        "lots": (1, 100),
        "squareOffTime": "time",
    },
    "Custom": {
        "stopLossPercent": (0.1, 50),
        "targetPercent": (0.1, 100),
        "perTradeAmount": (100, None),
        "squareOffTime": "time",
    },
}


class Rule(BaseModel):
    indicator: str
    operator: str
    value: str = Field(min_length=1)
    connector: Literal["AND", "OR"] = "AND"


class StrategyIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    template: Template = "Custom"
    instrument: str
    instruments: list[str] = Field(default_factory=list, max_length=100)
    timeframe: str
    params: dict[str, Any]
    entryRules: list[Rule] = []
    exitRules: list[Rule] = []

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("instrument")
    @classmethod
    def check_instrument(cls, v: str) -> str:
        v = v.strip().upper()
        aliases = {x.upper(): x for x in INSTRUMENTS}
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9 .&^_-]{0,39}", v):
            raise ValueError("Invalid instrument symbol")
        if v in {"STOCKS", "OPTIONS", "CUSTOM WATCHLIST"}:
            raise ValueError("Select a specific instrument or NIFTY 50 Stocks")
        return aliases.get(v, v)

    @field_validator("timeframe")
    @classmethod
    def check_tf(cls, v: str) -> str:
        v = v.strip().lower()
        timeframe_minutes(v)
        return v

    @model_validator(mode="after")
    def check_params(self) -> "StrategyIn":
        self.instruments = list(dict.fromkeys(self.check_instrument(value) for value in self.instruments))
        if len(self.instruments) == 1:
            self.instruments = [self.instrument]
        elif self.instruments:
            self.instrument = self.instruments[0]
        else:
            self.instruments = [self.instrument]
        rules = PARAM_RULES.get(self.template, PARAM_RULES["Custom"])
        clean: dict[str, Any] = {}

        # Handle aliases and defaults for Custom template
        if self.template == "Custom":
            if "stopLossPercent" not in self.params and "stopLoss" in self.params:
                self.params["stopLossPercent"] = self.params["stopLoss"]
            if "targetPercent" not in self.params and "targetProfit" in self.params:
                self.params["targetPercent"] = self.params["targetProfit"]
            if "squareOffTime" not in self.params:
                self.params["squareOffTime"] = "15:15"

        for key, rule in rules.items():
            if key not in self.params or self.params[key] in ("", None):
                # Apply defaults for optional or standard parameters
                if key == "squareOffTime":
                    clean[key] = "15:15"
                    continue
                elif key == "stopLossPercent":
                    clean[key] = 1.0
                    continue
                elif key == "targetPercent":
                    clean[key] = 2.0
                    continue
                elif key == "perTradeAmount":
                    clean[key] = 10000
                    continue
                raise ValueError(f"Parameter '{key}' is required")
            v = self.params[key]
            if rule == "time":
                if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(v)):
                    raise ValueError(f"'{key}' must be HH:MM")
                clean[key] = str(v)
            elif rule == "level":
                if not re.fullmatch(r"L[0-4]", str(v)):
                    raise ValueError("'level' must be L0 to L4")
                clean[key] = str(v)
            else:
                lo, hi = rule
                try:
                    n = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"'{key}' must be a number") from None
                if not math.isfinite(n):
                    raise ValueError(f"'{key}' must be finite")
                if lo is not None and n < lo:
                    raise ValueError(f"'{key}' must be at least {lo}")
                if hi is not None and n > hi:
                    raise ValueError(f"'{key}' must be at most {hi}")
                clean[key] = int(n) if n.is_integer() else n

        # Retain original frontend fields (stopLoss, targetProfit, quantity, etc.)
        for k, v in self.params.items():
            if k not in clean:
                clean[k] = v

        self.params = clean
        action = self.params.get("executionAction", "buy_underlying")
        if not isinstance(action, str) or action not in {"buy_underlying", "forward_put"}:
            raise ValueError("Unknown execution action")
        if action == "forward_put":
            if self.template != "Custom" or self.params.get("market", "IN") != "IN":
                raise ValueError("Forward Put Builder requires a Custom Indian-market strategy")
            if "optionExpiryMonths" in self.params:
                months = self.params["optionExpiryMonths"]
                if type(months) is not int or months not in (0, 1, 2):
                    raise ValueError("Expiry month must be 0 (this month), 1 (next month), or 2 (2 months forward)")
            lots = self.params.get("optionLots", 1)
            if isinstance(lots, bool) or not isinstance(lots, (int, float)) or not math.isfinite(lots) or int(lots) != lots or not 1 <= lots <= 1000:
                raise ValueError("Option lots must be an integer from 1 to 1000")
            self.params.update(executionAction=action, optionLots=int(lots))
        if self.template == "Custom":
            quantity = self.params.get("quantity", 100)
            try:
                q = float(quantity)
            except (ValueError, TypeError):
                raise ValueError("Quantity must be a positive integer") from None
            if not math.isfinite(q) or not q.is_integer() or not 1 <= q <= 1_000_000:
                raise ValueError("Quantity must be an integer from 1 to 1000000")
            self.params["quantity"] = int(q)
            if not self.entryRules:
                raise ValueError("At least one entry condition is required")
            validate_rules([r.model_dump() for r in self.entryRules])
            validate_rules([r.model_dump() for r in self.exitRules], exit_rules=True)
            self.exitRules = [r for r in self.exitRules if r.indicator != "Target / StopLoss"]
        if self.template != "Custom":
            self.entryRules, self.exitRules = [], []
        return self


class OrderIn(BaseModel):
    symbol: str
    side: Literal["BUY", "SELL"]
    qty: int = Field(gt=0, le=1_000_000)
    type: Literal["MARKET", "LIMIT"] = "MARKET"
    price: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def limit_needs_price(self) -> "OrderIn":
        if self.type == "LIMIT" and self.price is None:
            raise ValueError("Limit orders need a price")
        return self


class StatusIn(BaseModel):
    status: Status


class StageIn(BaseModel):
    stage: Stage


class KillIn(BaseModel):
    engaged: bool


class ModeIn(BaseModel):
    mode: Literal["paper", "live"]


class StrategyRiskIn(BaseModel):
    model_config = {"allow_inf_nan": False}
    maxDailyLoss: float | None = Field(default=None, gt=0)
    maxOpenPositions: int | None = Field(default=None, ge=1, le=100)


class RiskIn(BaseModel):
    model_config = {"allow_inf_nan": False}
    maxDailyLoss: float = Field(gt=0)
    maxOpenPositions: int = Field(ge=1, le=100)
    maxCapitalPerTrade: float = Field(gt=0)
    totalCapital: float = Field(gt=0)
    autoSquareOffTime: str
    riskPerTradePct: float = Field(default=0, ge=0, le=100)
    maxDrawdownPct: float = Field(default=0, ge=0, le=100)
    maxTradesPerDay: int = Field(default=0, ge=0, le=100000)
    strategyLimits: dict[str, StrategyRiskIn] = Field(default_factory=dict)

    @field_validator("autoSquareOffTime")
    @classmethod
    def check_time(cls, v: str) -> str:
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
            raise ValueError("autoSquareOffTime must be HH:MM")
        return v

    @model_validator(mode="after")
    def check_relations(self) -> "RiskIn":
        if self.maxCapitalPerTrade > self.totalCapital:
            raise ValueError("Per-trade capital cannot exceed total capital")
        if self.maxDailyLoss > self.totalCapital:
            raise ValueError("Daily loss limit cannot exceed total capital")
        return self
