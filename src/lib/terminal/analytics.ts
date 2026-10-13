import { seeded } from "./mock";

export interface DayResult {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  strategy?: string;
}

export interface Metrics {
  totalPnl: number;
  trades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  sharpe: number;
  bestDay: number;
  worstDay: number;
}

/** Generate a deterministic synthetic daily history (demo only, never real results). */
export function syntheticHistory(seed: number, days: number, edge = 0.12): DayResult[] {
  const r = seeded(seed);
  const out: DayResult[] = [];
  const d = new Date(Date.UTC(2026, 0, 5));
  while (out.length < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const trades = 2 + Math.floor(r() * 5);
    let wins = 0;
    let pnl = 0;
    for (let i = 0; i < trades; i++) {
      const win = r() < 0.5 + edge;
      if (win) wins++;
      pnl += win ? 400 + r() * 900 : -(300 + r() * 700);
    }
    out.push({
      date: d.toISOString().slice(0, 10),
      pnl: Math.round(pnl),
      trades,
      wins,
      strategy: "",
    });
  }
  return out;
}

export function computeMetrics(days: DayResult[], capital: number): Metrics {
  const pnls = days.map((d) => d.pnl);
  const total = pnls.reduce((a, b) => a + b, 0);
  const trades = days.reduce((a, d) => a + d.trades, 0);
  const wins = days.reduce((a, d) => a + d.wins, 0);
  const grossWin = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const winDays = pnls.filter((p) => p > 0);
  const lossDays = pnls.filter((p) => p < 0);
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  for (const p of pnls) {
    eq += p;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, peak - eq);
  }
  const mean = total / (pnls.length || 1);
  const sd = Math.sqrt(pnls.reduce((a, p) => a + (p - mean) ** 2, 0) / (pnls.length || 1));
  return {
    totalPnl: total,
    trades,
    winRate: trades ? (wins / trades) * 100 : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin: winDays.length ? grossWin / winDays.length : 0,
    avgLoss: lossDays.length ? -grossLoss / lossDays.length : 0,
    expectancy: trades ? total / trades : 0,
    maxDrawdown: (mdd / capital) * 100,
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : 0,
    bestDay: Math.max(0, ...pnls),
    worstDay: Math.min(0, ...pnls),
  };
}

export function equityCurve(days: DayResult[]) {
  let eq = 0;
  let peak = 0;
  return days.map((d) => {
    eq += d.pnl;
    peak = Math.max(peak, eq);
    return { date: d.date, equity: eq, drawdown: eq - peak };
  });
}
