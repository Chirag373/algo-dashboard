from typing import Literal
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas import KillIn, ModeIn, OrderIn, RiskIn, StageIn, StatusIn, StrategyIn
from app.services.engine import EngineError, TradingEngine

router = APIRouter()


def _engine(request: Request) -> TradingEngine:
    return request.app.state.engine


async def _run(request: Request, fn, *args):
    """Run an engine command, translate errors, push the new state to all clients."""
    engine = _engine(request)
    try:
        with engine.atomic():
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


@router.get("/market/nifty")
def get_nifty_chart(period: Literal["1D", "1W", "1M", "3M"] = "1D"):
    from app.services.market_chart import nifty_chart
    try:
        return nifty_chart(period)
    except Exception:
        raise HTTPException(status_code=503, detail="NIFTY history is unavailable from the market data provider. Please retry shortly.") from None


@router.get("/analytics")
async def get_analytics(request: Request, strategy_id: str | None = None,
                        date_from: date | None = None, date_to: date | None = None,
                        page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)):
    from app.services.analytics import performance
    engine = _engine(request)
    end = date_to or date.fromisoformat(engine.market_date)
    if date_from and date_from > end:
        raise HTTPException(status_code=422, detail="Start date must be on or before end date.")
    rows = engine.db.analytics_trades(date_from.isoformat() if date_from else None, end.isoformat(), strategy_id)
    capital = float(engine.risk["totalCapital"])
    result = performance(rows, capital)
    names = {s["id"]: s["name"] for s in engine.strategies}
    grouped = {}
    for trade in rows:
        sid = trade.get("strategyId") or ""
        group = grouped.setdefault(sid, {"strategyId": sid, "name": names.get(sid, "Manual trades" if sid in {"", "manual"} else "Removed strategy"), "trades": 0, "wins": 0, "pnl": 0})
        group["trades"] += 1
        group["wins"] += int(trade["pnl"] > 0)
        group["pnl"] = round(group["pnl"] + trade["pnl"], 2)
    options = engine.db.strategy_stats(engine.market_date)
    strategy_ids = dict.fromkeys([*names, *options])
    return {**result, "strategyBreakdown": list(grouped.values()), "capital": capital, "dateFrom": date_from.isoformat() if date_from else None,
            "dateTo": end.isoformat(), "page": page, "pageSize": page_size,
            "totalTrades": len(rows), "totalPages": (len(rows) + page_size - 1) // page_size,
            "strategies": [{"id": sid, "name": names.get(sid, "Manual trades" if sid in {"", "manual"} else f"Removed strategy ({sid})")} for sid in strategy_ids],
            "trades": [{**t, "strategyName": names.get(t.get("strategyId"), "Manual trade" if t.get("strategyId") in {None, "", "manual"} else "Removed strategy")}
                       for t in list(reversed(rows))[(page - 1) * page_size:page * page_size]]}


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
def get_history(symbol: str, request: Request, timeframe: str = "5m", limit: int = Query(500000, ge=1, le=500000), days_back: int = Query(36525, ge=1, le=36525)):
    # Try real live/historical exchange candles first (Nifty, Bank Nifty, Indian stocks)
    try:
        from app.services.kite_backtest import fetch_historical_candles
        from app.services.chart_history import aggregate_chart
        source_timeframe = "1d" if timeframe in {"1M", "1Y", "5Y"} else "1h" if timeframe == "4h" else timeframe
        candles = aggregate_chart(fetch_historical_candles(symbol, source_timeframe, days_back), timeframe, symbol)
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

    if timeframe in {"4h", "1M", "1Y", "5Y"}:
        raise HTTPException(status_code=503, detail="Historical candles for this timeframe are unavailable. Please retry.")

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
def get_assets(q: str = "", limit: int = Query(20000, ge=1, le=30000)):
    from app.services.indian_assets import assets
    from app.services.option_chain import ChainError
    try:
        records = {a["symbol"]: a for a in assets()}
    except ChainError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from None
    query = q.lower().strip()
    matches = [a for a in records.values() if not query or query in a["symbol"].lower() or query in a["name"].lower()]
    return {"ok": True, "assets": matches[:limit], "total": len(matches)}


@router.get("/quote/{symbol}")
def get_quote(symbol: str):
    from app.services.quotes import get_market_quote
    try:
        return {"ok": True, **get_market_quote(symbol)}
    except Exception:
        return {"ok": False, "symbol": symbol.upper(), "ltp": 0, "chg": None, "pct": None, "previousClose": None}


@router.get("/quotes")
def get_quotes(symbols: str = "NIFTY 50,BANKNIFTY,RELIANCE,TCS,HDFCBANK"):
    from app.services.quotes import batch_quotes
    requested = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(requested) > 50:
        raise HTTPException(status_code=422, detail="Request up to 50 symbols at a time.")
    return {"ok": True, "quotes": batch_quotes(requested)}


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


@router.get("/strategies/{sid}/logs")
async def strategy_logs(sid: str, request: Request, limit: int = 200):
    engine = _engine(request)
    try:
        engine._find_strategy(sid)
    except EngineError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from None
    return {"logs": engine.db.execution_logs(sid, limit)}
