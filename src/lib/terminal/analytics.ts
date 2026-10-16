import type { ClosedTrade } from "@/types";

export interface DayResult {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  equity: number;
  cumulativePnl: number;
  drawdown: number;
}

export interface Metrics {
  totalPnl: number;
  trades: number;
  wins: number;
  fees: number;
  winRate: number | null;
  profitFactor: number | null;
  profitFactorInfinite: boolean;
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  maxDrawdown: number | null;
  maxDrawdownAmount: number;
  sharpe: number | null;
  bestDay: number | null;
  worstDay: number | null;
  returnPct: number | null;
}

export interface AnalyticsResult {
  days: DayResult[];
  metrics: Metrics;
  capital: number;
  dateFrom: string | null;
  dateTo: string;
  page: number;
  pageSize: number;
  totalTrades: number;
  totalPages: number;
  strategies: { id: string; name: string }[];
  trades: (ClosedTrade & { strategyName: string })[];
}
