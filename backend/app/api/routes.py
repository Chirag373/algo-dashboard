from fastapi import APIRouter, HTTPException, Request

from app.schemas import KillIn, ModeIn, OrderIn, RiskIn, StageIn, StatusIn, StrategyIn
from app.services.engine import EngineError, TradingEngine

router = APIRouter()


def _engine(request: Request) -> TradingEngine:
    return request.app.state.engine


async def _run(request: Request, fn, *args):
    """Run an engine command, translate errors, push the new state to all clients."""
    engine = _engine(request)
    try:
        result = fn(*args)
    except EngineError as e:
        # State may have changed even on failure (e.g. a rejected order is logged)
        await request.app.state.hub.broadcast({"type": "snapshot", "data": engine.snapshot()})
        raise HTTPException(status_code=e.status, detail=e.message) from None
    state = engine.snapshot()
    await request.app.state.hub.broadcast({"type": "snapshot", "data": state})
    return {"ok": True, "result": result, "state": state}


@router.get("/health")
async def health(request: Request):
    e = _engine(request)
    return {"status": "ok", "mode": e.mode, "feed": e.feed.kind, "liveEnabled": e.live_enabled}


@router.get("/state")
async def state(request: Request):
    return _engine(request).snapshot()


@router.get("/history/{symbol}")
async def get_history(symbol: str, request: Request):
    e = _engine(request)
    if hasattr(e.feed, "history") and symbol in e.feed.history:
        bars = e.feed.history[symbol]
        return {
            "ok": True,
            "data": [
                {
                    "time": b.time,
                    "open": b.open,
                    "high": b.high,
                    "low": b.low,
                    "close": b.close
                }
                for b in bars
            ]
        }
    return {"ok": False, "data": []}



@router.post("/orders")
async def place_order(body: OrderIn, request: Request):
    e = _engine(request)
    return await _run(request, e.place_order, body)


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, request: Request):
    e = _engine(request)
    return await _run(request, e.cancel_order, order_id)


@router.post("/positions/square-off")
async def square_off(request: Request):
    e = _engine(request)
    return await _run(request, e.square_off_all)


@router.post("/positions/{position_id}/close")
async def close_position(position_id: str, request: Request):
    e = _engine(request)
    return await _run(request, e.close_position, position_id)


@router.put("/kill")
async def kill(body: KillIn, request: Request):
    e = _engine(request)
    return await _run(request, e.set_kill, body.engaged)


@router.put("/mode")
async def mode(body: ModeIn, request: Request):
    e = _engine(request)
    return await _run(request, e.set_mode, body.mode)


@router.put("/risk")
async def risk(body: RiskIn, request: Request):
    e = _engine(request)
    return await _run(request, e.update_risk, body)


@router.get("/strategies")
async def list_strategies(request: Request):
    return _engine(request).strategies


@router.post("/strategies", status_code=201)
async def create_strategy(body: StrategyIn, request: Request):
    e = _engine(request)
    return await _run(request, e.create_strategy, body)


@router.put("/strategies/{sid}")
async def update_strategy(sid: str, body: StrategyIn, request: Request):
    e = _engine(request)
    return await _run(request, e.update_strategy, sid, body)


@router.delete("/strategies/{sid}")
async def delete_strategy(sid: str, request: Request):
    e = _engine(request)
    return await _run(request, e.delete_strategy, sid)


@router.post("/strategies/{sid}/clone")
async def clone_strategy(sid: str, request: Request):
    e = _engine(request)
    return await _run(request, e.clone_strategy, sid)


@router.put("/strategies/{sid}/status")
async def strategy_status(sid: str, body: StatusIn, request: Request):
    e = _engine(request)
    return await _run(request, e.set_strategy_status, sid, body.status)


@router.put("/strategies/{sid}/stage")
async def strategy_stage(sid: str, body: StageIn, request: Request):
    e = _engine(request)
    return await _run(request, e.promote_strategy, sid, body.stage)
