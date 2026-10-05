import json
import logging

from fastapi import WebSocket

log = logging.getLogger("hub")


class Hub:
    """Fan-out of engine snapshots to connected websocket clients."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        if not self.clients:
            return
        payload = json.dumps(message)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)
