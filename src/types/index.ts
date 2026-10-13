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

export interface LiveIndicatorStatus {
  leftName: string;
  leftValue: number;
  rightName: string;
  rightValue: number;
  operator: string;
  lastCandleTime: string;
  candleClose: number;
  armed: boolean;
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
  currentPrice?: number;
  liveIndicators?: LiveIndicatorStatus;
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
  fees: number;
  reason: string;
  closedAt: string;
}

export interface AlertItem {
  id: string;
  time: string;
  level: "info" | "warn" | "error";
  message: string;
}
export type Alert = AlertItem;

export interface RiskConfig {
  maxDailyLoss: number;
  maxOpenPositions: number;
  maxCapitalPerTrade: number;
  totalCapital: number;
  autoSquareOffTime: string;
}
export type RiskLimits = RiskConfig;

export interface FeedStatus {
  kind: "real_market" | "simulated" | "broker";
  marketOpen: boolean;
}

export interface TerminalSnapshot {
  mode: Mode;
  liveEnabled: boolean;
  killed: boolean;
  feed: FeedStatus;
  marketTime: string;
  marketDate: string;
  prices: Record<string, number>;
  strategies: Strategy[];
  positions: Position[];
  orders: Order[];
  closed: ClosedTrade[];
  alerts: AlertItem[];
  risk: RiskConfig;
  openPnl: number;
  realizedPnl: number;
  dayPnl: number;
  lossLimitHit: boolean;
}
