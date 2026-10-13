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


# Top Indian Indices and Nifty 50 Bluechips
INDIAN_ASSETS = [
    {"symbol": "NIFTY 50", "name": "Nifty 50 Index", "exchange": "NSE", "tradable": True},
    {"symbol": "BANKNIFTY", "name": "Nifty Bank Index", "exchange": "NSE", "tradable": True},
    {"symbol": "FINNIFTY", "name": "Nifty Financial Services Index", "exchange": "NSE", "tradable": True},
    {"symbol": "SENSEX", "name": "BSE Sensex Index", "exchange": "BSE", "tradable": True},
    {"symbol": "RELIANCE", "name": "Reliance Industries Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TCS", "name": "Tata Consultancy Services Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "HDFCBANK", "name": "HDFC Bank Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "INFY", "name": "Infosys Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ICICIBANK", "name": "ICICI Bank Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "SBIN", "name": "State Bank of India", "exchange": "NSE", "tradable": True},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ITC", "name": "ITC Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "KOTAKBANK", "name": "Kotak Mahindra Bank Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "LT", "name": "Larsen & Toubro Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "AXISBANK", "name": "Axis Bank Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TATAMOTORS", "name": "Tata Motors Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "MARUTI", "name": "Maruti Suzuki India Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "SUNPHARMA", "name": "Sun Pharmaceutical Industries Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "BAJFINANCE", "name": "Bajaj Finance Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TITAN", "name": "Titan Company Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "WIPRO", "name": "Wipro Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TATASTEEL", "name": "Tata Steel Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "POWERGRID", "name": "Power Grid Corporation of India", "exchange": "NSE", "tradable": True},
    {"symbol": "NTPC", "name": "NTPC Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ULTRACEMCO", "name": "UltraTech Cement Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ADANIENT", "name": "Adani Enterprises Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ADANIPORTS", "name": "Adani Ports & SEZ Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ASIANPAINT", "name": "Asian Paints Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "HCLTECH", "name": "HCL Technologies Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "BAJAJFINSV", "name": "Bajaj Finserv Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "NESTLEIND", "name": "Nestle India Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "COALINDIA", "name": "Coal India Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "ONGC", "name": "Oil & Natural Gas Corp Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "JSWSTEEL", "name": "JSW Steel Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TRENT", "name": "Trent Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "BEL", "name": "Bharat Electronics Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "HAL", "name": "Hindustan Aeronautics Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "M&M", "name": "Mahindra & Mahindra Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TECHM", "name": "Tech Mahindra Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "EICHERMOT", "name": "Eicher Motors Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "DIVISLAB", "name": "Divi's Laboratories Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "CIPLA", "name": "Cipla Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "DRREDDY", "name": "Dr. Reddy's Laboratories Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "GRASIM", "name": "Grasim Industries Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "HEROMOTOCO", "name": "Hero MotoCorp Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "HINDALCO", "name": "Hindalco Industries Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "BPCL", "name": "Bharat Petroleum Corp Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "BRITANNIA", "name": "Britannia Industries Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "APOLLOHOSP", "name": "Apollo Hospitals Enterprise Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "INDUSINDBK", "name": "IndusInd Bank Ltd", "exchange": "NSE", "tradable": True},
    {"symbol": "TATACONSUM", "name": "Tata Consumer Products Ltd", "exchange": "NSE", "tradable": True},
]


@router.get("/history/{symbol}")
async def get_history(symbol: str, request: Request, timeframe: str = "5m", limit: int = 100):
    # Try real live/historical exchange candles first (Nifty, Bank Nifty, Indian stocks)
    try:
        from app.services.kite_backtest import fetch_historical_candles
        days_back = 30 if "d" in timeframe.lower() else (14 if "h" in timeframe.lower() else 5)
        candles = fetch_historical_candles(symbol, timeframe, days_back)
        if candles:
            return {
                "ok": True,
                "data": [
                    {
                        "time": c["time"],
                        "open": c["open"],
                        "high": c["high"],
                        "low": c["low"],
                        "close": c["close"],
                        "volume": c.get("volume", 0),
                    }
                    for c in candles[-limit:]
                ],
            }
    except Exception:
        pass

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
                for b in bars[-limit:]
            ]
        }

    # Fallback to Alpaca if configured for US equities
    try:
        from app.core.config import settings
        import urllib.request
        import json
        import datetime

        tf_map = {
            "1m": "1Min", "5m": "5Min", "15m": "15Min", "30m": "30Min",
            "1h": "1Hour", "1hrs": "1Hour", "4h": "4Hour", "4hrs": "4Hour", "1d": "1Day",
        }
        alpaca_tf = tf_map.get(timeframe.lower(), "5Min")
        now = datetime.datetime.now(datetime.timezone.utc)
        days_back = 30 if "d" in timeframe.lower() else 7
        start_time = (now - datetime.timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")
        req_url = (
            f"{settings.ALPACA_DATA_URL}/stocks/bars"
            f"?symbols={symbol.upper()}&timeframe={alpaca_tf}&start={start_time}&limit={limit}&feed=iex"
        )
        req_obj = urllib.request.Request(
            req_url,
            headers={
                "APCA-API-KEY-ID": settings.ALPACA_KEY_ID,
                "APCA-API-SECRET-KEY": settings.ALPACA_SECRET_KEY,
            }
        )
        with urllib.request.urlopen(req_obj, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            bars = data.get("bars", {}).get(symbol.upper(), [])
            return {
                "ok": True,
                "data": [
                    {
                        "time": b["t"],
                        "open": b["o"],
                        "high": b["h"],
                        "low": b["l"],
                        "close": b["c"],
                        "volume": b.get("v", 0)
                    }
                    for b in bars
                ]
            }
    except Exception:
        pass

    return {"ok": False, "data": []}


# Cached assets list in memory
_CACHED_ASSETS = []

@router.get("/assets")
async def get_assets(q: str = "", limit: int = 100):
    """Return searchable stock assets prioritizing Indian Nifty 50 and global equities."""
    global _CACHED_ASSETS
    from app.core.config import settings
    import urllib.request
    import json

    if not _CACHED_ASSETS:
        # Seed with Indian assets
        all_assets = list(INDIAN_ASSETS)
        try:
            req_obj = urllib.request.Request(
                f"{settings.ALPACA_PAPER_URL}/assets?status=active&asset_class=us_equity",
                headers={
                    "APCA-API-KEY-ID": settings.ALPACA_KEY_ID,
                    "APCA-API-SECRET-KEY": settings.ALPACA_SECRET_KEY,
                }
            )
            with urllib.request.urlopen(req_obj, timeout=10) as resp:
                raw = json.loads(resp.read().decode())
                us_assets = [
                    {
                        "symbol": item["symbol"],
                        "name": item["name"],
                        "exchange": item.get("exchange", "NASDAQ"),
                        "tradable": item.get("tradable", True),
                    }
                    for item in raw
                    if item.get("tradable") and item.get("status") == "active"
                ]
                all_assets.extend(us_assets)
        except Exception:
            pass
        _CACHED_ASSETS = all_assets

    q_lower = q.lower().strip()
    if not q_lower:
        return {"ok": True, "assets": _CACHED_ASSETS[:limit], "total": len(_CACHED_ASSETS)}

    filtered = [
        a for a in _CACHED_ASSETS
        if q_lower in a["symbol"].lower() or q_lower in a["name"].lower()
    ]
    return {"ok": True, "assets": filtered[:limit], "total": len(_CACHED_ASSETS)}


@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    """Return real-time quote (LTP, change, high, low) for any Indian or US asset."""
    from app.services.kite_backtest import fetch_exchange_candles
    try:
        candles = fetch_exchange_candles(symbol, "5m", 2)
        if candles:
            last = candles[-1]
            prev = candles[-2] if len(c := candles) > 1 else last
            ltp = last["close"]
            prev_close = prev["close"]
            chg = round(ltp - prev_close, 2)
            pct = round((chg / prev_close) * 100, 2) if prev_close else 0.0
            return {
                "ok": True,
                "symbol": symbol.upper(),
                "ltp": ltp,
                "chg": chg,
                "pct": pct,
                "high": last["high"],
                "low": last["low"],
                "open": last["open"],
                "time": last["time"],
            }
    except Exception as e:
        pass
    return {"ok": False, "symbol": symbol.upper(), "ltp": 0, "chg": 0, "pct": 0}


@router.get("/quotes")
async def get_quotes(symbols: str = "NIFTY 50,BANKNIFTY,RELIANCE,TCS,HDFCBANK"):
    """Return batch real-time quotes for multiple comma-separated symbols."""
    from app.services.kite_backtest import fetch_exchange_candles
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    results = {}
    for s in sym_list:
        try:
            candles = fetch_exchange_candles(s, "5m", 2)
            if candles:
                last = candles[-1]
                prev = candles[-2] if len(candles) > 1 else last
                ltp = last["close"]
                prev_close = prev["close"]
                chg = round(ltp - prev_close, 2)
                pct = round((chg / prev_close) * 100, 2) if prev_close else 0.0
                results[s.upper()] = {
                    "ltp": ltp,
                    "chg": chg,
                    "pct": pct,
                    "high": last["high"],
                    "low": last["low"],
                    "time": last["time"],
                }
        except Exception:
            pass
    return {"ok": True, "quotes": results}


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
