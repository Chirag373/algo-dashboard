"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, ApiError, WS_URL } from "@/utils/api";
import { PRICE_BOOK } from "@/utils/mock";
import type {
  Alert,
  ClosedTrade,
  Mode,
  Order,
  Position,
  RiskLimits,
  Side,
  Strategy,
  StrategyStats,
  RiskStatus,
} from "@/types";

interface OrderRequest {
  symbol: string;
  side: Side;
  qty: number;
  type: "MARKET" | "LIMIT";
  price?: number;
  strategyId?: string;
}

export type Connection = "connecting" | "online" | "offline";
export interface Result {
  ok: boolean;
  message: string;
}

/** Shape pushed by the backend over the websocket (and returned by every command). */
interface Snapshot {
  mode: Mode;
  liveEnabled: boolean;
  killed: boolean;
  feed: { kind: string; marketOpen: boolean };
  marketTime: string;
  marketDate: string;
  prices: Record<string, number>;
  strategies: Strategy[];
  positions: Position[];
  orders: Order[];
  closed: ClosedTrade[];
  strategyStats: Record<string, StrategyStats>;
  alerts: Alert[];
  risk: RiskLimits;
  riskStatus?: RiskStatus;
  openPnl: number;
  realizedPnl: number;
  dayPnl: number;
  lossLimitHit: boolean;
}

interface TerminalState {
  connection: Connection;
  ready: boolean;
  mode: Mode;
  liveEnabled: boolean;
  killed: boolean;
  feedConnected: boolean;
  feedKind: string;
  marketOpen: boolean;
  marketDate: string;
  prices: Record<string, number>;
  strategies: Strategy[];
  positions: Position[];
  orders: Order[];
  closed: ClosedTrade[];
  strategyStats: Record<string, StrategyStats>;
  alerts: Alert[];
  risk: RiskLimits;
  riskStatus?: RiskStatus;
  now: string;
  openPnl: number;
  realizedPnl: number;
  dayPnl: number;
  lossLimitHit: boolean;
  requestMode: (m: Mode) => Promise<Result>;
  toggleKill: () => Promise<Result>;
  engageKill: () => Promise<Result>;
  squareOffAll: () => Promise<Result>;
  closePosition: (id: string) => Promise<Result>;
  placeOrder: (o: OrderRequest) => Promise<Result>;
  cancelOrder: (id: string) => Promise<Result>;
  setStrategyStatus: (id: string, s: Strategy["status"]) => Promise<Result>;
  promoteStrategy: (id: string, stage: Strategy["stage"]) => Promise<Result>;
  saveStrategy: (s: Strategy, isNew: boolean) => Promise<Result>;
  deleteStrategy: (id: string) => Promise<Result>;
  cloneStrategy: (id: string) => Promise<Result>;
  updateRisk: (r: RiskLimits) => Promise<Result>;
  dismissAlert: (id: string) => void;
}

const EMPTY_RISK: RiskLimits = {
  maxDailyLoss: 0,
  maxOpenPositions: 0,
  maxCapitalPerTrade: 0,
  totalCapital: 0,
  autoSquareOffTime: "15:19",
};

const DEFAULT_TERMINAL_STATE: TerminalState = {
  connection: "offline",
  ready: true,
  mode: "paper",
  liveEnabled: false,
  killed: false,
  feedConnected: true,
  feedKind: "real_market",
  marketOpen: true,
  marketDate: "",
  prices: {},
  strategies: [],
  positions: [],
  orders: [],
  closed: [],
  strategyStats: {},
  alerts: [],
  risk: EMPTY_RISK,
  now: "",
  openPnl: 0,
  realizedPnl: 0,
  dayPnl: 0,
  lossLimitHit: false,
  requestMode: async () => ({ ok: true, message: "" }),
  toggleKill: async () => ({ ok: true, message: "" }),
  engageKill: async () => ({ ok: true, message: "" }),
  squareOffAll: async () => ({ ok: true, message: "" }),
  closePosition: async () => ({ ok: true, message: "" }),
  placeOrder: async () => ({ ok: true, message: "" }),
  cancelOrder: async () => ({ ok: true, message: "" }),
  setStrategyStatus: async () => ({ ok: true, message: "" }),
  promoteStrategy: async () => ({ ok: true, message: "" }),
  saveStrategy: async () => ({ ok: true, message: "" }),
  deleteStrategy: async () => ({ ok: true, message: "" }),
  cloneStrategy: async () => ({ ok: true, message: "" }),
  updateRisk: async () => ({ ok: true, message: "" }),
  dismissAlert: () => {},
};

const Ctx = createContext<TerminalState | null>(null);

export function useTerminal(): TerminalState {
  const c = useContext(Ctx);
  return c ?? DEFAULT_TERMINAL_STATE;
}

export function pnlOf(p: Pick<Position, "side" | "avg" | "ltp" | "qty">) {
  return (p.side === "BUY" ? p.ltp - p.avg : p.avg - p.ltp) * p.qty;
}

let localSeq = 0;

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [localAlerts, setLocalAlerts] = useState<Alert[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const localAlert = useCallback((level: Alert["level"], message: string) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLocalAlerts((a) => [{ id: `local${++localSeq}`, time, level, message }, ...a].slice(0, 10));
  }, []);

  // Live state from the backend, with automatic reconnect.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        attempt = 0;
        setConnection("online");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; data: Snapshot };
          if (msg.type === "snapshot") setSnap(msg.data);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setConnection("offline");
        attempt += 1;
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 10000));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  const lastSnap = useRef<Snapshot | null>(null);

  useEffect(() => {
    lastSnap.current = snap;
  }, [snap]);

  /** Run a command; apply the returned state immediately; surface failures as toasts. */
  const run = useCallback(
    async (
      method: "GET" | "POST" | "PUT" | "DELETE",
      path: string,
      body?: unknown,
      okMessage = "Done",
      toastOnError = true
    ): Promise<Result> => {
      try {
        const res = await api<{ result?: { message?: string }; state?: Snapshot }>(
          method,
          path,
          body
        );
        if (res.state) setSnap(res.state);
        return { ok: true, message: res.result?.message ?? okMessage };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Unexpected error";
        if (toastOnError) localAlert("warn", message);
        return { ok: false, message };
      }
    },
    [localAlert]
  );

  const positions = useMemo(
    () => (snap?.positions ?? []).map((p) => ({ ...p, ltp: snap?.prices[p.symbol] ?? p.ltp })),
    [snap]
  );

  const alerts = useMemo(
    () => [...localAlerts, ...(snap?.alerts ?? [])].filter((a) => !hidden.has(a.id)),
    [localAlerts, snap, hidden]
  );

  const value: TerminalState = {
    connection,
    ready: snap !== null,
    mode: snap?.mode ?? "paper",
    liveEnabled: snap?.liveEnabled ?? false,
    killed: snap?.killed ?? false,
    feedConnected: connection === "online",
    feedKind: snap?.feed.kind ?? "unknown",
    marketOpen: snap?.feed.marketOpen ?? false,
    marketDate: snap?.marketDate ?? "",
    prices: snap?.prices ?? PRICE_BOOK,
    strategies: snap?.strategies ?? [],
    positions,
    orders: snap?.orders ?? [],
    closed: snap?.closed ?? [],
    strategyStats: snap?.strategyStats ?? {},
    alerts,
    risk: snap?.risk ?? EMPTY_RISK,
    riskStatus: snap?.riskStatus,
    now: snap?.marketTime ?? "--:--:--",
    openPnl: snap?.openPnl ?? 0,
    realizedPnl: snap?.realizedPnl ?? 0,
    dayPnl: snap?.dayPnl ?? 0,
    lossLimitHit: snap?.lossLimitHit ?? false,

    requestMode: (m) => run("PUT", "/mode", { mode: m }, `Mode set to ${m}`),
    toggleKill: () =>
      run("PUT", "/kill", { engaged: !(lastSnap.current?.killed ?? false) }, "Kill switch updated"),
    engageKill: () => run("PUT", "/kill", { engaged: true }, "Kill switch engaged"),
    squareOffAll: () => run("POST", "/positions/square-off", undefined, "Squared off"),
    closePosition: (id) => run("POST", `/positions/${id}/close`, undefined, "Position closed"),
    placeOrder: (o) =>
      run(
        "POST",
        "/orders",
        { symbol: o.symbol, side: o.side, qty: o.qty, type: o.type, price: o.price },
        "Order placed",
        false
      ),
    cancelOrder: (id) => run("POST", `/orders/${id}/cancel`, undefined, "Order cancelled"),
    setStrategyStatus: (id, status) =>
      run("PUT", `/strategies/${id}/status`, { status }, `Strategy ${status}`),
    promoteStrategy: (id, stage) =>
      run("PUT", `/strategies/${id}/stage`, { stage }, `Moved to ${stage}`),
    saveStrategy: (s, isNew) => {
      const body = {
        name: s.name,
        template: s.template || "Custom",
        instrument: s.instrument,
        instruments: s.instruments ?? [],
        timeframe: s.timeframe,
        params: s.params,
        entryRules: s.entryRules ?? [],
        exitRules: s.exitRules ?? [],
      };
      return isNew
        ? run("POST", "/strategies", body, "Strategy created", true)
        : run("PUT", `/strategies/${s.id}`, body, "Strategy saved", true);
    },
    deleteStrategy: (id) => run("DELETE", `/strategies/${id}`, undefined, "Strategy deleted"),
    cloneStrategy: (id) => run("POST", `/strategies/${id}/clone`, undefined, "Strategy cloned"),
    updateRisk: (r) => run("PUT", "/risk", r, "Risk limits saved", false),
    dismissAlert: (id) => setHidden((h) => new Set(h).add(id)),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
