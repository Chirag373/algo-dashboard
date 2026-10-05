from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.market_data import connection_manager

router = APIRouter()

@router.websocket("/ws/market-data")
async def websocket_endpoint(websocket: WebSocket):
    await connection_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages (e.g. subscribe/unsubscribe)
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
