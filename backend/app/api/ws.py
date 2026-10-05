from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
    hub = websocket.app.state.hub
    engine = websocket.app.state.engine
    await hub.connect(websocket)
    try:
        await websocket.send_json({"type": "snapshot", "data": engine.snapshot()})
        while True:
            await websocket.receive_text()  # client pings; commands go over REST
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(websocket)
