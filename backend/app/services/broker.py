"""Broker abstraction.

The engine never talks to a broker directly; it goes through BrokerInterface.
PaperBroker simulates fills. Real adapters (Upstox, Dhan, Zerodha) will
implement the same interface later and be selected by configuration.
"""
from dataclasses import dataclass
from typing import Protocol


@dataclass
class Fill:
    price: float
    fee: float


class BrokerInterface(Protocol):
    name: str
    is_paper: bool

    def execute_market(self, symbol: str, side: str, qty: int, ltp: float) -> Fill: ...


class PaperBroker:
    name = "paper"
    is_paper = True

    def __init__(self, fee_per_order: float = 20.0):
        self.fee_per_order = fee_per_order

    def execute_market(self, symbol: str, side: str, qty: int, ltp: float) -> Fill:
        # Fills at last traded price. Slippage/partial fills can be modelled here.
        return Fill(price=round(ltp, 2), fee=self.fee_per_order)

    def fee_for_limit(self) -> float:
        return self.fee_per_order
