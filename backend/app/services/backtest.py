"""Isolated chronological historical replay; no broker, engine DB or order API.

Signals use completed saved-timeframe candles. Orders fill at the next available
source candle's open, with adverse slippage on both sides and fixed order fees.
"""
import copy
import heapq
import math
import statistics
from collections import defaultdict
from datetime import datetime, timedelta

from app.schemas import StrategyIn
from app.services.candles import aggregate, timeframe_minutes
from app.services.conditions import evaluate, parse_operand
from app.services.history import HistoryError, InstrumentUnavailable, fetch_history, market_timezone
from app.services.engine import TradingEngine


def _money(value):
    return round(value, 2)


def run_saved_backtest(strategy: dict, days_back: int, capital: float, slippage_pct: float,
                       fee_per_order: float, *, now=None, loader=fetch_history) -> dict:
    saved = copy.deepcopy(strategy)
    validated = StrategyIn.model_validate(saved).model_dump()
    saved.update(validated)
    if saved["template"] not in {"Custom", "ORB"}:
        raise HistoryError(f"{saved['template']} has no historical execution model. No substitute strategy was tested.")
    market = saved["params"].get("market", "IN")
    tz = market_timezone(saved["instrument"],market)
    end = (now or datetime.now(tz)).astimezone(tz).replace(hour=0,minute=0,second=0,microsecond=0)
    start = end-timedelta(days=days_back)
    tf = timeframe_minutes(saved["timeframe"])
    periods = [int(parse_operand(r[k])[1]) for r in saved.get("entryRules",[])+saved.get("exitRules",[]) for k in ["indicator","value"] if parse_operand(r[k])[0] in {"EMA","SMA","RSI","SUPERTREND"}]
    warm_days = min(730, max(10, math.ceil((max(periods,default=1)+2)*tf/375*7/5)+10))
    warm_start = start-timedelta(days=warm_days)
    symbols = TradingEngine._universe(saved["instrument"])
    datasets, coverage, warnings = {}, [], []
    excluded = []
    event_heap = []
    seq = 0
    unavailable = 0
    gaps = 0
    total_source = 0
    for symbol in symbols:
        try:
            data = loader(symbol,saved["timeframe"],start,end,warm_start,market=market)
        except InstrumentUnavailable as exc:
            if len(symbols)==1:
                raise
            excluded.append({"symbol":symbol,"reason":str(exc)})
            continue
        warnings.extend(f"{symbol}: {w}" for w in data.warnings)
        source = aggregate(data.candles,f"{data.source_minutes}m",end,symbol,data.source_minutes,keep_segments=True,market=market)
        selected = aggregate(data.candles,saved["timeframe"],end,symbol,data.source_minutes,keep_segments=True,market=market)
        replay = [b for b in source if start.timestamp() <= b["time"] < end.timestamp()]
        if not replay:
            message = f"No historical candles for {symbol} during {start.date()} to {(end-timedelta(days=1)).date()}. The range may contain holidays, lack provider coverage, or require data permissions."
            if len(symbols)==1:
                raise HistoryError(message)
            excluded.append({"symbol":symbol,"reason":message})
            continue
        total_source += len(source)
        if total_source > 500000:
            raise HistoryError("This basket and history range exceeds 500,000 source candles. Use a smaller range or individual instruments.")
        observed_sessions = {b["session"] for b in replay}
        missing_weekdays = [(start+timedelta(days=i)).date().isoformat() for i in range(days_back) if (start+timedelta(days=i)).weekday()<5 and (start+timedelta(days=i)).date().isoformat() not in observed_sessions]
        if missing_weekdays:
            warnings.append(f"{symbol}: {len(missing_weekdays)} requested weekdays have no candles (exchange holidays or provider gaps); they are not counted as observed trading sessions.")
        if not any(b["end"]>start.timestamp() for b in selected):
            warnings.append(f"{symbol}: no complete {saved['timeframe']} strategy candles were available in the requested period.")
        gaps += sum(1 for i,b in enumerate(replay) if i and b["session"]==replay[i-1]["session"] and b["time"]!=replay[i-1]["end"])
        # Calculate all causal indicator series once per uninterrupted segment.
        segments = defaultdict(list)
        for b in selected:
            segments[b["segment"]].append(b)
        decisions = {}
        for rows in segments.values():
            cache = {}
            for i,b in enumerate(rows):
                if b["end"] <= start.timestamp():
                    continue
                entry = evaluate(saved["entryRules"],rows,index=i,cache=cache) if saved["template"] == "Custom" else None
                exits = evaluate(saved["exitRules"],rows,index=i,cache=cache) if saved["exitRules"] else None
                if entry and entry.matched is None:
                    unavailable += 1
                decisions[b["end"]] = (b,entry,exits)
        datasets[symbol] = dict(source=source,replay=replay,decisions=decisions)
        coverage.append(dict(symbol=symbol,source=data.source,sourceMinutes=data.source_minutes,
            firstCandle=datetime.fromtimestamp(replay[0]["time"],tz).isoformat(),
            lastCandle=datetime.fromtimestamp(replay[-1]["end"],tz).isoformat(),
            noSessionDates=missing_weekdays,candleCount=len(replay),strategyCandles=sum(1 for b in selected if b["end"]>start.timestamp()),
            sessions=sorted({b["session"] for b in replay})))
        if replay[0]["time"]-start.timestamp()>7*86400 or end.timestamp()-replay[-1]["end"]>7*86400:
            warnings.append(f"{symbol}: only partial requested-period coverage was returned. Review its first and last candles before interpreting these results.")
        for b in replay:
            seq += 1
            heapq.heappush(event_heap,(b["time"],1,seq,symbol,b))
            heapq.heappush(event_heap,(b["end"],0,seq,symbol,b))
    if not coverage:
        raise HistoryError("No basket instruments have historical data for this period. " + "; ".join(f"{item['symbol']}: {item['reason']}" for item in excluded))
    if excluded:
        warnings.insert(0, f"Partial basket backtest: {len(coverage)} of {len(symbols)} instruments tested. Excluded: {', '.join(item['symbol'] for item in excluded)}. Results cover only the available instruments.")
    if unavailable:
        warnings.append(f"{unavailable} strategy candles had unavailable required operands (indicator warmup, missing opening range or volume); those conditions could not trigger an entry.")
    if gaps:
        warnings.append(f"{gaps} intraday source-data gaps detected. Incomplete strategy candles are skipped and indicator warmup restarts after a gap; no missing prices are synthesized.")
    if any(c["sourceMinutes"]>1 for c in coverage):
        warnings.append("Exits use the provider's source-candle OHLC resolution shown below. Intrabar paths and exact touch times are unavailable; stops take precedence when stop and target touch in the same candle.")
    p = saved["params"]
    cutoff = p.get("squareOffTime","15:15")
    slip = slippage_pct/100
    cash = float(capital)
    positions, pending, marks, latches, orb = {}, {}, {}, {}, {}
    trades, curve = [], []
    rejected = 0
    last_time = None

    def iso(ts):
        return datetime.fromtimestamp(ts,tz).isoformat()

    def local_time(ts):
        return datetime.fromtimestamp(ts,tz).strftime("%H:%M")

    def equity():
        return cash+sum((marks.get(sym,pos["entry"])-pos["entry"])*pos["sign"]*pos["qty"] for sym,pos in positions.items())

    peak = float(capital)
    max_dd, max_dd_pct = 0.0, 0.0
    def point(ts):
        nonlocal peak, max_dd, max_dd_pct
        value = _money(equity())
        peak = max(peak,value)
        dd = peak-value
        dd_pct = dd/peak*100 if peak>0 else 0
        max_dd = max(max_dd,dd)
        max_dd_pct = max(max_dd_pct,dd_pct)
        item = dict(time=iso(ts),date=datetime.fromtimestamp(ts,tz).date().isoformat(),equity=value,drawdown=-dd_pct)
        if curve and curve[-1]["time"]==item["time"]:
            curve[-1] = item
        else:
            curve.append(item)

    def close(symbol, price, ts, reason):
        nonlocal cash
        pos = positions.pop(symbol)
        exit_price = _money(price*(1-pos["sign"]*slip))
        gross = _money((exit_price-pos["entry"])*pos["sign"]*pos["qty"])
        cash = _money(cash+gross-fee_per_order)
        trades.append(dict(id=f"BT-{len(trades)+1}",symbol=symbol,side="BUY" if pos["sign"]==1 else "SELL",
            entryTime=iso(pos["time"]),exitTime=iso(ts),entry=pos["entry"],exit=exit_price,qty=pos["qty"],
            grossPnl=gross,fees=_money(2*fee_per_order),pnl=_money(gross-2*fee_per_order),reason=reason,
            signalTime=iso(pos["signalTime"])))
        pending.pop(symbol,None)

    point(start.timestamp())
    while event_heap:
        ts,kind,_,symbol,b = heapq.heappop(event_heap)
        if last_time is not None and ts!=last_time:
            point(last_time)
        last_time = ts
        if kind==1:  # next source-candle open
            marks[symbol] = b["open"]
            if symbol in positions and (local_time(ts)>=cutoff or positions[symbol]["session"]!=b["session"]):
                close(symbol,b["open"],ts,"Delayed square-off (data gap)" if positions[symbol]["session"]!=b["session"] else "Strategy square-off")
            order = pending.pop(symbol,None)
            if order and order["kind"]=="exit" and symbol in positions:
                close(symbol,b["open"],ts,"Exit conditions satisfied")
            elif order and order["kind"]=="entry" and symbol not in positions and local_time(ts)<cutoff and order["session"]==b["session"]:
                sign = order["sign"]
                fill = _money(b["open"]*(1+sign*slip))
                qty = order["qty"]
                margin = .1 if symbol in {"NIFTY 50","BANKNIFTY","FINNIFTY","SENSEX"} else 1.0
                used = sum(pos["entry"]*pos["qty"]*pos["margin"] for pos in positions.values())
                if fill*qty*margin+fee_per_order > equity()-used:
                    rejected += 1
                else:
                    cash = _money(cash-fee_per_order)
                    sl_pct = float(p.get("stopLossPercent",p.get("initialSlPercent",1)))
                    tp_pct = float(p.get("targetPercent",sl_pct*2))
                    positions[symbol] = dict(entry=fill,qty=qty,sign=sign,time=ts,signalTime=order["signalTime"],session=b["session"],
                        sl=_money(fill*(1-sign*sl_pct/100)),target=_money(fill*(1+sign*tp_pct/100)),margin=margin,locked=False)
        else:  # source candle finished: protective exits, then saved-rule decisions
            marks[symbol] = b["close"]
            pos = positions.get(symbol)
            if pos:
                buy = pos["sign"]==1
                if (buy and b["low"]<=pos["sl"]) or (not buy and b["high"]>=pos["sl"]):
                    price = min(b["open"],pos["sl"]) if buy else max(b["open"],pos["sl"])
                    close(symbol,price,ts,"Trailing stop hit" if pos["locked"] else "Stop-loss hit")
                elif (buy and b["high"]>=pos["target"]) or (not buy and b["low"]<=pos["target"]):
                    price = max(b["open"],pos["target"]) if buy else min(b["open"],pos["target"])
                    close(symbol,price,ts,"Target hit")
                elif local_time(ts)>=cutoff:
                    close(symbol,b["close"],ts,"Strategy square-off")
                elif saved["template"]=="ORB":
                    best = b["high"] if buy else b["low"]
                    gain = (best-pos["entry"])*pos["sign"]/pos["entry"]*100
                    lock,step = float(p["tslLockPercent"]),float(p["tslTrailStep"])
                    if gain>=lock:
                        pos["locked"] = True
                        shift = math.floor((gain-lock)/step)*step if step>0 else 0
                        trailing = _money(pos["entry"]*(1+pos["sign"]*shift/100))
                        pos["sl"] = max(pos["sl"],trailing) if buy else min(pos["sl"],trailing)
            decision = datasets[symbol]["decisions"].get(ts)
            if decision:
                candle,entry,exit_result = decision
                sign = 1
                if saved["template"]=="Custom":
                    previous = latches.get(symbol,False)
                    if entry.matched is not None:
                        latches[symbol] = entry.matched
                    signal = entry.matched and not previous
                else:
                    state = orb.setdefault((symbol,candle["session"]),dict(valid=candle["sessionFirst"],high=-math.inf,low=math.inf,armed=True,trades=0,rangeEnd=candle["time"]+int(p["rangeCandleCount"])*tf*60,previousEnd=candle["time"]))
                    signal = False
                    if candle["time"] < state["rangeEnd"]:
                        if candle["time"] != state["previousEnd"]:
                            state["valid"] = False
                        state["high"] = max(state["high"],candle["high"])
                        state["low"] = min(state["low"],candle["low"])
                        state["previousEnd"] = candle["end"]
                    elif state["valid"] and state["previousEnd"]==state["rangeEnd"]:
                        if state["low"]<=candle["close"]<=state["high"]:
                            state["armed"] = True
                        elif state["armed"] and state["trades"]<int(p["maxTradesPerStock"]):
                            signal = True
                            sign = 1 if candle["close"]>state["high"] else -1
                if symbol in positions:
                    if exit_result and exit_result.matched:
                        pending[symbol] = dict(kind="exit")
                elif signal and local_time(ts)<cutoff:
                    qty = int(p.get("quantity") or max(1,int(float(p.get("perTradeAmount",10000))//candle["close"])))
                    pending[symbol] = dict(kind="entry",qty=qty,sign=sign,signalTime=ts,session=b["session"])
                    if saved["template"]=="ORB":
                        state["armed"] = False
                        state["trades"] += 1
            if ts==datasets[symbol]["replay"][-1]["end"]:
                if symbol in positions:
                    close(symbol,b["close"],ts,"End of backtest")
                pending.pop(symbol,None)

    if last_time is not None:
        point(last_time)
    if rejected:
        warnings.append(f"{rejected} entry signals were rejected for insufficient test capital; configured quantity was never reduced. Index margin is modeled at 10%; equities at 100%.")
    if not trades:
        warnings.append("No trades met the saved strategy's conditions and execution requirements in this period.")
    result = build_result(saved,start,end,capital,trades,curve,coverage,warnings,max_dd,max_dd_pct,slippage_pct,fee_per_order)
    result.update(coverageComplete=not excluded, requestedInstruments=symbols, excludedInstruments=excluded)
    return result


def build_result(strategy,start,end,capital,trades,curve,coverage,warnings,max_dd,max_dd_pct,slippage,fee):
    daily = {}
    for item in curve:
        daily[item["date"]] = item["equity"]
    sessions = sorted({d for c in coverage for d in c["sessions"]})
    day_results, previous = [], float(capital)
    for day in sessions:
        value = daily.get(day,previous)
        closed = [t for t in trades if t["exitTime"][:10]==day]
        day_results.append(dict(date=day,equity=value,pnl=_money(value-previous),trades=len(closed),wins=sum(t["pnl"]>0 for t in closed),returnPct=(value/previous-1)*100 if previous>0 else None))
        previous = value
    monthly = []
    for month in sorted({d["date"][:7] for d in day_results}):
        rows = [d for d in day_results if d["date"].startswith(month)]
        opening = rows[0]["equity"]-rows[0]["pnl"]
        pnl = _money(sum(r["pnl"] for r in rows))
        monthly.append(dict(month=month,pnl=pnl,returnPct=pnl/opening*100 if opening>0 else None,trades=sum(r["trades"] for r in rows),wins=sum(r["wins"] for r in rows)))
    total = _money(sum(t["pnl"] for t in trades))
    profit = sum(max(0,t["pnl"]) for t in trades)
    loss = abs(sum(min(0,t["pnl"]) for t in trades))
    returns = [d["returnPct"]/100 for d in day_results if d["returnPct"] is not None]
    sharpe = None
    if len(returns)>=2 and statistics.stdev(returns)>0:
        sharpe = statistics.mean(returns)/statistics.stdev(returns)*math.sqrt(252)
    wins = sum(t["pnl"]>0 for t in trades)
    return dict(ok=True,strategy={k:strategy[k] for k in ["id","name","version","template","instrument","timeframe","params","entryRules","exitRules"] if k in strategy},
        period=dict(requestedStart=start.isoformat(),requestedEndExclusive=end.isoformat(),calendarDays=(end-start).days,
            actualStart=min(c["firstCandle"] for c in coverage),actualEnd=max(c["lastCandle"] for c in coverage),timezone=str(start.tzinfo)),
        coverage=coverage,warnings=list(dict.fromkeys(warnings)),trades=sorted(trades,key=lambda t:(t["exitTime"],t["id"])),
        curve=curve,dayResults=day_results,monthlyReturns=monthly,
        summary=dict(totalPnl=total,totalTrades=len(trades),totalWins=wins,winRate=wins/len(trades)*100 if trades else 0,
            returnPct=total/capital*100,portfolioValue=_money(capital+total),initialCapital=capital,
            profitFactor=profit/loss if loss else None,profitFactorInfinite=bool(profit and not loss),grossProfit=_money(profit),grossLoss=_money(loss),
            maxDrawdown=_money(max_dd),maxDrawdownPct=max_dd_pct,sharpeRatio=sharpe,tradingDays=len(sessions),totalFees=_money(sum(t["fees"] for t in trades))),
        assumptions=dict(entry="Next available source candle open after the signal candle closes",exits="Source OHLC; stop first if both stop and target touch; gap-aware fills; intrabar threshold exit times are reported at the source candle close",equity="Mark-to-market at source candle observations; final positions liquidated at last available close",slippagePct=slippage,feePerOrder=fee,sharpe="Daily session returns, sample standard deviation, annualized sqrt(252), risk-free rate 0; null if undefined",margin="Indices 10%, equities 100%; regular exchange cash sessions only"))
