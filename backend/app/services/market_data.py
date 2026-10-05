import asyncio
import json
import random
from typing import Callable, Dict, Any
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                dead_connections.append(connection)
        for dc in dead_connections:
            self.disconnect(dc)

connection_manager = ConnectionManager()

class BrokerAdapter:
    """
    Adapter for a specific broker API (e.g., Zerodha KiteConnect, Upstox).
    Follows dependency inversion for easier testing.
    """
    def __init__(self):
        self.running = False
        self.callbacks = []
        self.state = {
            "NIFTY": {"ltp": 22000.0, "high": 22050.0, "low": 21950.0, "volume": 150000},
            "BANKNIFTY": {"ltp": 47000.0, "high": 47100.0, "low": 46800.0, "volume": 200000}
        }

    def register_callback(self, callback: Callable[[Dict[str, Any]], None]):
        self.callbacks.append(callback)

    async def start_stream(self):
        self.running = True
        while self.running:
            await asyncio.sleep(1)
            for symbol in self.state:
                change = random.uniform(-5, 5)
                self.state[symbol]["ltp"] = round(self.state[symbol]["ltp"] + change, 2)
                self.state[symbol]["high"] = max(self.state[symbol]["high"], self.state[symbol]["ltp"])
                self.state[symbol]["low"] = min(self.state[symbol]["low"], self.state[symbol]["ltp"])
                self.state[symbol]["volume"] += random.randint(100, 1000)
                
                tick_data = {
                    "symbol": symbol,
                    "ltp": self.state[symbol]["ltp"],
                    "high": self.state[symbol]["high"],
                    "low": self.state[symbol]["low"],
                    "volume": self.state[symbol]["volume"]
                }
                for cb in self.callbacks:
                    await cb(tick_data)

    def stop_stream(self):
        self.running = False

broker_instance = BrokerAdapter()
