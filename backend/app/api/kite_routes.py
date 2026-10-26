"""
Kite Connect API routes:
- GET  /api/v1/kite/login-url         → Get Kite login URL
- POST /api/v1/kite/session           → Exchange request_token for access_token
- POST /api/v1/kite/set-token         → Manually set access token
- GET  /api/v1/kite/status            → Check if token is set
- GET  /api/v1/kite/candles           → Fetch real Nifty candles
- POST /api/v1/kite/backtest          → Run real-data backtest
"""

import copy
import logging

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, ConfigDict

router = APIRouter()


class SessionIn(BaseModel):
    request_token: str


class TokenIn(BaseModel):
    access_token: str


class BacktestIn(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    strategy_id: str = Field(min_length=1)
    days_back: int = Field(default=30, ge=1, le=3650, strict=True)
    capital: float | None = Field(default=None, gt=0, le=1e12)
    slippage_pct: float = Field(default=0.05, ge=0, le=5)
    fee_per_order: float | None = Field(default=None, ge=0, le=100000)


@router.get("/login-url")
async def kite_login_url():
    """Return the URL the user opens to authenticate with Zerodha."""
    try:
        from app.services.kite_backtest import get_login_url
        return {"ok": True, "login_url": get_login_url()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session")
def kite_session(body: SessionIn):
    """Exchange request_token for access_token after Kite login."""
    try:
        from app.services.kite_backtest import generate_session
        data = generate_session(body.request_token)
        return {"ok": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/set-token")
async def kite_set_token(body: TokenIn):
    """Manually set the Kite access token."""
    try:
        from app.services.kite_backtest import set_access_token
        set_access_token(body.access_token)
        return {"ok": True, "message": "Access token set successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
def kite_status():
    """Check if Kite access token is valid by making a live API call."""
    import urllib.request
    import urllib.error
    import json
    from app.services.kite_backtest import get_access_token
    from app.core.config import settings
    token = get_access_token()
    if not token:
        return {"ok": True, "connected": False, "api_key": settings.KITE_API_KEY, "has_token": False}
    # Validate by calling Kite profile API
    try:
        req = urllib.request.Request(
            "https://api.kite.trade/user/profile",
            headers={
                "X-Kite-Version": "3",
                "Authorization": f"token {settings.KITE_API_KEY}:{token}",
            }
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            user_name = data.get("data", {}).get("user_name", "")
        return {"ok": True, "connected": True, "api_key": settings.KITE_API_KEY, "has_token": True, "user_name": user_name}
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            from app.services.kite_backtest import set_access_token
            set_access_token("")
            return {"ok": True, "connected": False, "has_token": False, "error": "Token expired or invalid"}
        raise HTTPException(status_code=503, detail="Unable to verify Zerodha session. Retry shortly.") from None
    except Exception:
        raise HTTPException(status_code=503, detail="Unable to reach Zerodha. Your saved session has been retained.") from None


@router.get("/candles")
def kite_candles(symbol: str = "NIFTY 50", interval: str = "5m", days_back: int = 30):
    """Fetch real historical OHLCV candles from Kite for a symbol."""
    try:
        from app.services.kite_backtest import fetch_historical_candles
        candles = fetch_historical_candles(symbol, interval, days_back)
        return {"ok": True, "symbol": symbol, "interval": interval, "count": len(candles), "candles": candles}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch candles: {str(e)}")


@router.post("/backtest")
async def kite_backtest(body: BacktestIn, request: Request):
    from app.core.config import settings
    from app.services.backtest import run_saved_backtest
    from app.services.engine import EngineError
    from app.services.history import HistoryError
    try:
        # Snapshot the saved version on the engine thread before doing any I/O.
        strategy = copy.deepcopy(request.app.state.engine._find_strategy(body.strategy_id))
        return await run_in_threadpool(
            run_saved_backtest, strategy, body.days_back, body.capital,
            body.slippage_pct,
            settings.PAPER_FEE_PER_ORDER if body.fee_per_order is None else body.fee_per_order,
        )
    except EngineError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from None
    except (HistoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except Exception:
        logging.getLogger("backtest").exception("Historical backtest failed")
        raise HTTPException(status_code=502, detail="Historical backtest failed. Check provider availability and server logs; no trading state was changed.") from None


@router.get("/option-chain")
def option_chain(symbol: str = "NIFTY", expiry: str | None = None):
    from app.services.option_chain import chain, ChainError
    try:
        return chain(symbol, expiry)
    except ChainError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from None


@router.get("/option-underlyings")
def option_underlyings():
    from app.services.option_chain import underlyings, ChainError
    try:
        return underlyings()
    except ChainError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from None
