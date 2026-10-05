import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Template = Literal["ORB", "FinBaba", "Custom"]
Stage = Literal["Draft", "Backtest", "Paper", "Live"]
Status = Literal["running", "paused", "stopped"]

TIMEFRAMES = {"1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60}
INSTRUMENTS = ["NIFTY", "BANKNIFTY", "NIFTY 50 Stocks", "Custom Watchlist"]

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


class StrategyIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    template: Template
    instrument: str
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
        if v not in INSTRUMENTS:
            raise ValueError(f"Unknown instrument '{v}'")
        return v

    @field_validator("timeframe")
    @classmethod
    def check_tf(cls, v: str) -> str:
        if v not in TIMEFRAMES:
            raise ValueError(f"Unknown timeframe '{v}'")
        return v

    @model_validator(mode="after")
    def check_params(self) -> "StrategyIn":
        rules = PARAM_RULES[self.template]
        clean: dict[str, Any] = {}
        for key, rule in rules.items():
            if key not in self.params or self.params[key] in ("", None):
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
                if lo is not None and n < lo:
                    raise ValueError(f"'{key}' must be at least {lo}")
                if hi is not None and n > hi:
                    raise ValueError(f"'{key}' must be at most {hi}")
                clean[key] = int(n) if n.is_integer() else n
        self.params = clean
        if self.template == "Custom" and (not self.entryRules or not self.exitRules):
            raise ValueError("Custom strategies need at least one entry and one exit condition")
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


class RiskIn(BaseModel):
    maxDailyLoss: float = Field(gt=0)
    maxOpenPositions: int = Field(ge=1, le=100)
    maxCapitalPerTrade: float = Field(gt=0)
    totalCapital: float = Field(gt=0)
    autoSquareOffTime: str

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
