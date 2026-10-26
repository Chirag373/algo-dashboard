export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_TERMINAL_WS_URL ??
  process.env.NEXT_PUBLIC_WS_URL ??
  `${API_BASE_URL.replace(/^http/, "ws").replace(/\/api\/v1\/?$/, "")}/ws/terminal`;

export const DEFAULT_SYMBOLS = [
  "NIFTY 50",
  "NIFTY",
  "BANKNIFTY",
  "NIFTY BANK",
  "FINNIFTY",
  "SENSEX",
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "SBIN",
  "TATAMOTORS",
];

export const INTERVALS = [
  { value: "1m", label: "1 Min" },
  { value: "5m", label: "5 Min" },
  { value: "15m", label: "15 Min" },
  { value: "30m", label: "30 Min" },
  { value: "1h", label: "1 Hour" },
  { value: "1d", label: "Daily" },
];

export const STANDARD_TIMEFRAMES = [
  { value: "1m", label: "1m (1 Minute)" },
  { value: "5m", label: "5m (5 Minutes)" },
  { value: "15m", label: "15m (15 Minutes)" },
  { value: "30m", label: "30m (30 Minutes)" },
  { value: "1h", label: "1h (1 Hour)" },
  { value: "4h", label: "4h (4 Hours)" },
  { value: "custom", label: "Custom Timeframe..." },
];

export const INDICATOR_TYPES = [
  { value: "EMA", label: "EMA", hasPeriod: true, defaultPeriod: 9 },
  { value: "SMA", label: "SMA", hasPeriod: true, defaultPeriod: 20 },
  { value: "RSI", label: "RSI", hasPeriod: true, defaultPeriod: 14 },
  { value: "Price", label: "Price (Close)", hasPeriod: false },
  { value: "Opening Range High", label: "Opening Range High", hasPeriod: false },
  { value: "Opening Range Low", label: "Opening Range Low", hasPeriod: false },
  { value: "USDINR", label: "USD/INR (Futures)", hasPeriod: false },
  { value: "VIX", label: "VIX (India VIX)", hasPeriod: false },
  { value: "VWAP", label: "VWAP", hasPeriod: false },
  { value: "Supertrend", label: "Supertrend", hasPeriod: false },
  { value: "Number", label: "Fixed Number / Value", hasPeriod: false, isNumber: true },
];

export const OPERATORS = [
  { value: "crosses_above", label: "Crosses Above" },
  { value: "crosses_below", label: "Crosses Below" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
];

export const OPERATORS_LIST = [
  "crosses above",
  "crosses below",
  "greater than",
  "less than",
  "is above",
  "is below",
  "equals",
];
