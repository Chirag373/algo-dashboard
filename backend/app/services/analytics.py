"""Realized trade analytics over the complete selected SQLite history."""
from collections import defaultdict
from math import sqrt
from statistics import mean, stdev


def performance(trades: list[dict], capital: float) -> dict:
    daily = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "wins": 0})
    profit = loss = fees = pnl = 0.0
    wins = 0
    equity = peak = capital
    max_dd = max_dd_pct = 0.0
    for trade in trades:
        value = float(trade["pnl"])
        pnl += value
        fees += float(trade.get("fees", 0))
        profit += max(value, 0)
        loss += max(-value, 0)
        wins += value > 0
        day = daily[trade["tradeDate"]]
        day["pnl"] += value
        day["trades"] += 1
        day["wins"] += value > 0
        equity += value
        peak = max(peak, equity)
        max_dd = max(max_dd, peak - equity)
        if peak > 0:
            max_dd_pct = max(max_dd_pct, (peak - equity) / peak * 100)
    days = []
    running = 0.0
    daily_peak = capital
    returns = []
    valid_returns = capital > 0
    for date, day in sorted(daily.items()):
        before = capital + running
        if before > 0:
            returns.append(day["pnl"] / before)
        else:
            valid_returns = False
        running += day["pnl"]
        eq = capital + running
        daily_peak = max(daily_peak, eq)
        days.append({"date": date, "pnl": round(day["pnl"], 2), "trades": day["trades"],
                     "wins": day["wins"], "equity": round(eq, 2),
                     "cumulativePnl": round(running, 2), "drawdown": round(eq - daily_peak, 2)})
    positive_days = [d["pnl"] for d in days if d["pnl"] > 0]
    negative_days = [d["pnl"] for d in days if d["pnl"] < 0]
    sharpe = None
    if valid_returns and len(returns) >= 2 and stdev(returns) > 0:
        sharpe = mean(returns) / stdev(returns) * sqrt(252)
    count = len(trades)
    return {"days": days, "metrics": {
        "totalPnl": round(pnl, 2), "trades": count, "wins": wins, "fees": round(fees, 2),
        "winRate": wins / count * 100 if count else None,
        "profitFactor": profit / loss if loss else None,
        "profitFactorInfinite": profit > 0 and loss == 0,
        "avgWin": mean(positive_days) if positive_days else None,
        "avgLoss": mean(negative_days) if negative_days else None,
        "expectancy": pnl / count if count else None,
        "maxDrawdown": max_dd_pct if capital > 0 and count else None,
        "maxDrawdownAmount": round(max_dd, 2), "sharpe": sharpe,
        "bestDay": max(d["pnl"] for d in days) if days else None,
        "worstDay": min(d["pnl"] for d in days) if days else None,
        "returnPct": pnl / capital * 100 if capital > 0 and count else None,
    }}
