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
  connector?: "AND" | "OR";
}

export interface LiveIndicatorStatus {
  leftName: string;
  leftValue: number | null;
  rightName: string;
  rightValue: number | null;
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
  instruments?: string[];
  timeframe: string;
  stage: StrategyStage;
  status: StrategyStatus;
  version: number;
  params: Record<string, ParamValue>;
  entryRules?: Rule[];
  exitRules?: Rule[];
  currentPrice?: number;
  liveIndicators?: LiveIndicatorStatus;
  execution?: Record<
    string,
    {
      message?: string;
      lastCandle?: number;
      conditions?: (Rule & {
        left: number | null;
        right: number | null;
        matched: boolean | null;
      })[];
    }
  >;
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
  tradeDate?: string;
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
  tradeDate?: string;
}

export interface StrategyStats {
  trades: number;
  wins: number;
  realizedPnl: number;
  dayRealizedPnl: number;
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
  riskPerTradePct?: number;
  maxDrawdownPct?: number;
  maxTradesPerDay?: number;
  strategyLimits?: Record<string, { maxDailyLoss: number | null; maxOpenPositions: number | null }>;
}
export type RiskLimits = RiskConfig;

export interface RiskStatus {
  entriesToday: number;
  drawdownAmount: number;
  drawdownPct: number;
  drawdownLimitHit: boolean;
  tradeLimitHit: boolean;
  trackingStartedAt: string;
  strategies: Record<string, { dayPnl: number; positions: number; blocked: boolean }>;
}

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
  strategyStats: Record<string, StrategyStats>;
  alerts: AlertItem[];
  risk: RiskConfig;
  riskStatus?: RiskStatus;
  openPnl: number;
  realizedPnl: number;
  dayPnl: number;
  lossLimitHit: boolean;
}
