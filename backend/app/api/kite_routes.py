"""
Kite Connect API routes:
- GET  /api/v1/kite/login-url         → Get Kite login URL
- POST /api/v1/kite/session           → Exchange request_token for access_token
- POST /api/v1/kite/set-token         → Manually set access token
- GET  /api/v1/kite/status            → Check if token is set
- GET  /api/v1/kite/candles           → Fetch real Nifty candles
- POST /api/v1/kite/backtest          → Run real-data backtest
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class SessionIn(BaseModel):
    request_token: str


class TokenIn(BaseModel):
    access_token: str


class BacktestIn(BaseModel):
    symbol: str = "NIFTY 50"
    interval: str = "5m"
    days_back: int = 60
    capital: float = 300000
    slippage_pct: float = 0.05
    strategy: dict


@router.get("/login-url")
async def kite_login_url():
    """Return the URL the user opens to authenticate with Zerodha."""
    try:
        from app.services.kite_backtest import get_login_url
        return {"ok": True, "login_url": get_login_url()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session")
async def kite_session(body: SessionIn):
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
async def kite_status():
    """Check if Kite access token is valid by making a live API call."""
    import urllib.request
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
    except Exception:
        # Token is invalid/expired
        from app.services.kite_backtest import set_access_token
        set_access_token("")  # Clear bad token
        return {"ok": True, "connected": False, "api_key": settings.KITE_API_KEY, "has_token": False, "error": "Token expired or invalid"}


@router.get("/candles")
async def kite_candles(symbol: str = "NIFTY 50", interval: str = "5m", days_back: int = 30):
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
async def kite_backtest(body: BacktestIn):
    """
    Run a full indicator-based backtest using real Kite historical data.
    Fetches real OHLCV candles and applies strategy conditions (EMA crossovers, etc.)
    """
    try:
        from app.services.kite_backtest import fetch_historical_candles, run_backtest

        # Fetch real candles
        candles = fetch_historical_candles(body.symbol, body.interval, body.days_back)
        if len(candles) < 30:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data: only {len(candles)} candles fetched. Try increasing days_back."
            )

        # Inject instrument into strategy
        strat = dict(body.strategy)
        strat["instrument"] = body.symbol

        result = run_backtest(
            candles=candles,
            strategy=strat,
            capital=body.capital,
            slippage_pct=body.slippage_pct,
        )

        return {
            "ok": True,
            "symbol": body.symbol,
            "interval": body.interval,
            "candleCount": len(candles),
            **result,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")
