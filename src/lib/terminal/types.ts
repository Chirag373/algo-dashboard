export type Mode = "paper" | "live";
export type Side = "BUY" | "SELL";
export type StrategyStatus = "running" | "paused" | "stopped";
export type StrategyStage = "Draft" | "Backtest" | "Paper" | "Live";
export type StrategyTemplate = "ORB" | "FinBaba" | "Custom";
export type ParamValue = number | string | boolean;

export interface Rule {
  indicator: string;
  operator: string;
  value: string;
}

export interface Strategy {
  id: string;
  name: string;
  template: StrategyTemplate;
  instrument: string;
  timeframe: string;
  stage: StrategyStage;
  status: StrategyStatus;
  version: number;
  params: Record<string, ParamValue>;
  entryRules?: Rule[];
  exitRules?: Rule[];
}

export interface Position {
  id: string;
  strategyId: string;
  symbol: string;
  side: Side;
  qty: number;
  avg: number;
  ltp: number;
  sl: number;
  target: number;
  openedAt: string;
}

export interface Order {
  id: string;
  time: string;
  symbol: string;
  side: Side;
  type: "MARKET" | "LIMIT";
  qty: number;
  price: number;
  status: "COMPLETE" | "OPEN" | "REJECTED" | "CANCELLED";
  strategyId: string;
  note?: string;
}

export interface ClosedTrade {
  id: string;
  strategyId: string;
  symbol: string;
  side: Side;
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
  reason: string;
  closedAt: string;
}

export interface Alert {
  id: string;
  time: string;
  level: "info" | "warn" | "critical";
  message: string;
}

export interface RiskLimits {
  maxDailyLoss: number;
  maxOpenPositions: number;
  maxCapitalPerTrade: number;
  totalCapital: number;
  autoSquareOffTime: string;
}
