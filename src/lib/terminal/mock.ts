import type { Position, RiskLimits, Strategy } from "./types";

/** Deterministic PRNG so server and client render identical demo data. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PRICE_BOOK: Record<string, number> = {
  "NIFTY FUT": 24510,
  "BANKNIFTY FUT": 52340,
  RELIANCE: 2935,
  TCS: 4120,
  INFY: 1865,
  HDFCBANK: 1710,
  SBIN: 825,
};

export const SYMBOLS = Object.keys(PRICE_BOOK);

export const INSTRUMENTS = ["NIFTY", "BANKNIFTY", "NIFTY 50 Stocks", "Custom Watchlist"];
export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h"];
export const INDICATORS = [
  "Price",
  "Opening Range High",
  "Opening Range Low",
  "EMA(9)",
  "EMA(21)",
  "SMA(50)",
  "RSI(14)",
  "VWAP",
  "Volume",
  "Supertrend",
];
export const OPERATORS = ["crosses above", "crosses below", "is above", "is below", "equals"];

export const initialStrategies: Strategy[] = [
  {
    id: "orb-nifty50",
    name: "ORB Nifty 50 Stocks",
    template: "ORB",
    instrument: "NIFTY 50 Stocks",
    timeframe: "5m",
    stage: "Paper",
    status: "running",
    version: 3,
    params: {
      initialSlPercent: 2,
      tslLockPercent: 1.5,
      tslTrailStep: 0.5,
      perTradeAmount: 10000,
      rangeCandleCount: 5,
      maxTradesPerStock: 2,
      squareOffTime: "15:19",
    },
  },
  {
    id: "fb-c4",
    name: "FinBaba C4 Nifty",
    template: "FinBaba",
    instrument: "NIFTY",
    timeframe: "5m",
    stage: "Paper",
    status: "running",
    version: 2,
    params: { isl: 50, csl: 30, level: "L0", lots: 1, squareOffTime: "15:15" },
  },
  {
    id: "fb-b5",
    name: "FinBaba B5 BankNifty",
    template: "FinBaba",
    instrument: "BANKNIFTY",
    timeframe: "15m",
    stage: "Paper",
    status: "paused",
    version: 1,
    params: { isl: 120, csl: 80, level: "L4", lots: 1, squareOffTime: "15:15" },
  },
  {
    id: "ema-cross",
    name: "EMA 9/21 Crossover",
    template: "Custom",
    instrument: "NIFTY",
    timeframe: "15m",
    stage: "Backtest",
    status: "stopped",
    version: 1,
    params: { stopLossPercent: 0.8, targetPercent: 1.6, squareOffTime: "15:15" },
    entryRules: [{ indicator: "EMA(9)", operator: "crosses above", value: "EMA(21)" }],
    exitRules: [{ indicator: "EMA(9)", operator: "crosses below", value: "EMA(21)" }],
  },
];

const t = (hhmm: string) => `${hhmm}:00`;

export const initialPositions: Position[] = [
  {
    id: "p1",
    strategyId: "orb-nifty50",
    symbol: "RELIANCE",
    side: "BUY",
    qty: 40,
    avg: 2921.5,
    ltp: 2935,
    sl: 2863,
    target: 3010,
    openedAt: t("09:35"),
  },
  {
    id: "p2",
    strategyId: "fb-c4",
    symbol: "NIFTY FUT",
    side: "BUY",
    qty: 75,
    avg: 24480,
    ltp: 24510,
    sl: 24430,
    target: 24600,
    openedAt: t("09:50"),
  },
  {
    id: "p3",
    strategyId: "orb-nifty50",
    symbol: "INFY",
    side: "SELL",
    qty: 100,
    avg: 1872,
    ltp: 1865,
    sl: 1909,
    target: 1830,
    openedAt: t("10:05"),
  },
];

export const initialRisk: RiskLimits = {
  maxDailyLoss: 15000,
  maxOpenPositions: 5,
  maxCapitalPerTrade: 150000,
  totalCapital: 300000,
  autoSquareOffTime: "15:19",
};

export function strategyName(id: string, list: Strategy[]) {
  return list.find((s) => s.id === id)?.name ?? (id === "manual" ? "Manual" : id);
}
