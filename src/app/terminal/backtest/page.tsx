"use client";

import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useTerminal } from "@/components/terminal/context";
import { api } from "@/utils/api";
import { Select } from "@/components/terminal/ui";
import { pnlColor } from "@/utils/format";
import type { Strategy } from "@/types";
import {
  Play,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Wifi,
  ChevronRight,
  FileText,
  Calendar,
  Key,
} from "lucide-react";

interface HistoricalTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  fees: number;
  reason: string;
}
interface BacktestResult {
  summary: {
    totalPnl: number;
    totalTrades: number;
    totalWins: number;
    winRate: number;
  };
  trades: HistoricalTrade[];
  strategy: Strategy;
  period: {
    requestedStart: string;
    requestedEndExclusive: string;
    calendarDays: number;
    actualStart: string;
    actualEnd: string;
    timezone: string;
  };
  coverage: {
    symbol: string;
    source: string;
    sourceMinutes: number;
    firstCandle: string;
    lastCandle: string;
    candleCount: number;
    sessions: string[];
  }[];
  warnings: string[];
  requestedInstruments: string[];
  excludedInstruments: { symbol: string; reason: string }[];
  coverageComplete: boolean;
}

function subscribeLocation(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export default function Backtest() {
  const t = useTerminal();
  const [chosenId, setStrategyId] = useState("");
  const query = useSyncExternalStore(
    subscribeLocation,
    () => window.location.search,
    () => ""
  );
  const queryId = new URLSearchParams(query).get("strategyId");
  const strategyId =
    t.strategies.find((s) => s.id === chosenId)?.id ??
    t.strategies.find((s) => s.id === queryId)?.id ??
    t.strategies[0]?.id ??
    "";
  const [daysBack, setDaysBack] = useState(30);
  const [customDays, setCustomDays] = useState("");
  const [customHorizon, setCustomHorizon] = useState(false);
  const [storedStatus, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [storedError, setError] = useState<string | null>(null);
  const [storedResult, setResult] = useState<BacktestResult | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [kiteConnected, setKiteConnected] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);
  const [attemptKey, setAttemptKey] = useState("");
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const selectedStrat = useMemo(
    () => t.strategies.find((s) => s.id === strategyId),
    [t.strategies, strategyId]
  );
  const configKey = JSON.stringify([strategyId, selectedStrat?.version, daysBack]);
  const status = attemptKey === configKey ? storedStatus : "idle";
  const error = attemptKey === configKey ? storedError : null;
  const result = attemptKey === configKey ? storedResult : null;
  useEffect(() => {
    generation.current += 1;
    request.current?.abort();
  }, [configKey]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api<{ connected: boolean }>("GET", "/kite/status")
        .then((data) => {
          if (active) setKiteConnected(data.connected);
        })
        .catch(() => {
          if (active) setKiteConnected(false);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    void api<{ login_url: string }>("GET", "/kite/login-url")
      .then((data) => {
        if (active) setLoginUrl(data.login_url);
      })
      .catch(() => {});
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const handleSaveToken = async () => {
    if (!accessToken.trim()) return;
    setAttemptKey(configKey);
    setTokenSaving(true);
    setError(null);
    try {
      await api("POST", "/kite/set-token", { access_token: accessToken.trim() });
      const data = await api<{ connected: boolean }>("GET", "/kite/status");
      setKiteConnected(data.connected);
      if (!data.connected)
        throw new Error("Kite rejected this token. Please reconnect with a valid session.");
      setShowTokenInput(false);
      setAccessToken("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect Kite");
      setStatus("error");
    } finally {
      setTokenSaving(false);
    }
  };
  const invalid = !selectedStrat || !Number.isInteger(daysBack) || daysBack < 1 || daysBack > 3650;
  const handleRunBacktest = async () => {
    if (invalid) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++generation.current;
    setAttemptKey(configKey);
    setResult(null);
    setError(null);
    setStatus("loading");
    setShowAllTrades(false);
    try {
      const data = await api<BacktestResult>(
        "POST",
        "/kite/backtest",
        {
          strategy_id: strategyId,
          days_back: daysBack,
        },
        { signal: controller.signal }
      );
      if (id !== generation.current) return;
      setResult(data);
      setStatus("done");
    } catch (e) {
      if (controller.signal.aborted || id !== generation.current) return;
      setError(e instanceof Error ? e.message : "Backtest failed");
      setStatus("error");
    }
  };
  const trades = result?.trades ?? [];
  const currency =
    (result?.strategy ?? selectedStrat)?.params.market === "US" ||
    ["AAPL", "MSFT", "SPY", "QQQ", "NVDA", "TSLA", "AMZN", "GOOGL", "META"].includes(
      (result?.strategy ?? selectedStrat)?.instrument ?? ""
    )
      ? "USD"
      : "INR";
  const money = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
  const dateTime = (value: string) =>
    new Date(value).toLocaleString("en-GB", { timeZone: result?.period.timezone, hour12: false });
  return (
    <div className="max-w-[1400px] w-full mx-auto flex flex-col space-y-5 text-slate-900 pb-16">
      {/* Breadcrumb matching screenshot */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
        <span>Backtest</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <span className="text-slate-600">Configure</span>
      </div>

      {/* Header Row matching screenshot */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Backtest</h1>
          <p className="text-xs text-slate-500 mt-1">
            Replay saved strategies on actual historical market candles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
            Historical data · Isolated simulation
          </div>

          {/* Kite Connected */}
          {kiteConnected ? (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              <Wifi className="w-3.5 h-3.5 text-slate-500" />
              Kite Connected
            </div>
          ) : (
            <button
              onClick={() => setShowTokenInput(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200/80 transition-colors"
              title="Connect Kite for extended historical coverage"
            >
              <Wifi className="w-3.5 h-3.5 text-slate-500" />
              Connect Kite
            </button>
          )}

          {/* Run Backtest Button */}
          <button
            onClick={handleRunBacktest}
            disabled={status === "loading" || invalid || !t.ready}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Backtest</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Kite Login Panel */}
      {showTokenInput && (
        <div className="bg-blue-50/80 rounded-2xl p-5 space-y-3 shadow-xs border border-blue-100">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-blue-900 text-sm">Connect Zerodha Kite (Optional)</span>
          </div>
          <p className="text-xs text-blue-800">
            Click the button below to log in with your Zerodha account. It will automatically
            redirect and connect your session:
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href={loginUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#e8401a] hover:bg-[#c93515] text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Zerodha Login
            </a>
            <span className="text-[11px] text-slate-500">or paste token manually:</span>
          </div>
          <div className="flex gap-2.5 mt-1">
            <input
              type="password"
              placeholder="Paste your Kite access_token here..."
              className="flex-1 text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white border border-slate-200"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <button
              onClick={handleSaveToken}
              disabled={!accessToken.trim() || tokenSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              {tokenSaving ? "Saving..." : "Connect"}
            </button>
            <button
              onClick={() => setShowTokenInput(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Card 1: Test Configuration */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">Test Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">Set your strategy and testing period.</p>
        </div>

        {/* Inputs 2-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          {/* Select Strategy to Backtest */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-700" />
              Select Strategy to Backtest
            </label>
            <Select
              variant="outline"
              value={strategyId}
              onChange={setStrategyId}
              options={
                t.strategies.length
                  ? t.strategies.map((s) => ({
                      value: s.id,
                      label: `${s.name} (v${s.version}) — ${s.instruments?.join(", ") || s.instrument} · ${s.timeframe}`,
                    }))
                  : [
                      {
                        value: "",
                        label: t.ready ? "Create a strategy first" : "Loading saved strategies…",
                      },
                    ]
              }
            />
          </div>

          {/* Historical Test Horizon */}
          <div>
            <label className="text-xs font-bold text-slate-800 flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-700" />
              Historical Test Horizon
            </label>
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Historical test horizon"
            >
              {[1, 3, 7, 15, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={!customHorizon && daysBack === d}
                  onClick={() => {
                    setCustomHorizon(false);
                    setDaysBack(d);
                  }}
                  className={`h-10 w-16 rounded-xl border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    !customHorizon && daysBack === d
                      ? "border-blue-600 bg-blue-600 text-white shadow-2xs"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {d}d
                </button>
              ))}
              <input
                aria-label="Custom horizon in days"
                type="number"
                placeholder="Custom"
                className={`h-10 w-16 appearance-none rounded-xl border px-1 text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                  customHorizon
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                value={customDays}
                min={1}
                max={3650}
                step={1}
                onFocus={() => {
                  setCustomHorizon(true);
                  setDaysBack(Number(customDays));
                }}
                onChange={(e) => {
                  setCustomDays(e.target.value);
                  setCustomHorizon(true);
                  setDaysBack(Number(e.target.value));
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {status === "error" && error && (
        <div className="p-4 bg-rose-50 rounded-2xl flex items-start gap-3 border border-rose-100">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-900 text-xs">Backtest Failed</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Card 2: Simulation Results */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Simulation Results</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Historical trade executions for the selected strategy and period.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {status === "loading"
                ? "Fetching history and replaying…"
                : status === "done"
                  ? "Complete"
                  : status === "error"
                    ? "Backtest failed"
                    : "Awaiting a backtest"}
            </span>
          </div>
        </div>

        {result?.excludedInstruments?.length ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2"
          >
            <p className="font-bold">
              Partial basket results · {result.coverage.length} of{" "}
              {result.requestedInstruments.length} instruments tested
            </p>
            <p>
              Unavailable instruments were excluded. These trades represent only the available
              portion of the saved basket.
            </p>
            {result.excludedInstruments.map((item) => (
              <p key={item.symbol}>
                <strong>{item.symbol}</strong>: {item.reason}
              </p>
            ))}
          </div>
        ) : null}
        {result && (
          <div className="mb-4 text-xs text-slate-500 space-y-2">
            <p>
              {result.strategy.name} v{result.strategy.version} ·{" "}
              {dateTime(result.period.actualStart)} to {dateTime(result.period.actualEnd)} ·{" "}
              {result.period.timezone} ·{" "}
              {[...new Set(result.coverage.map((c) => c.source))].join(", ")}
            </p>
            {result.warnings.length > 0 && (
              <details className="rounded-xl bg-amber-50 p-3 text-amber-800">
                <summary className="cursor-pointer">
                  Data and execution notices ({result.warnings.length})
                </summary>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  {result.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6" aria-label="Backtest summary">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <p className="text-xs font-medium text-slate-500">Backtest P&amp;L</p>
            <p
              className={`mt-2 text-2xl font-bold tabular-nums ${result ? pnlColor(result.summary.totalPnl) : "text-slate-400"}`}
            >
              {result ? signed(result.summary.totalPnl) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Net of order fees</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <p className="text-xs font-medium text-slate-500">Number of trades</p>
            <p
              className={`mt-2 text-2xl font-bold tabular-nums ${result ? "text-slate-900" : "text-slate-400"}`}
            >
              {result ? result.summary.totalTrades.toLocaleString() : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Closed backtest trades</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <p className="text-xs font-medium text-slate-500">Win rate</p>
            <p
              className={`mt-2 text-2xl font-bold tabular-nums ${result ? "text-blue-600" : "text-slate-400"}`}
            >
              {result && result.summary.totalTrades > 0
                ? `${result.summary.winRate.toFixed(1)}%`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {result
                ? `${result.summary.totalWins} winning trades / ${result.summary.totalTrades} total`
                : "Run a backtest to see results"}
            </p>
          </div>
        </div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Trade List{result ? ` (${trades.length})` : ""}
        </h3>
        <div className="pt-2">
          {trades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/90 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Trade ID</th>
                    <th className="py-3 px-4">Entry Time</th>
                    <th className="py-3 px-4">Exit Time</th>
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4 text-center">Side</th>
                    <th className="py-3 px-4 text-right">Entry</th>
                    <th className="py-3 px-4 text-right">Exit</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4 text-right">P&amp;L ({currency})</th>
                    <th className="py-3 px-4 text-right">Fees</th>
                    <th className="py-3 px-4">Exit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(showAllTrades ? trades : trades.slice(0, 15)).map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-500">{tr.id}</td>
                      <td className="py-3 px-4 text-slate-700">{dateTime(tr.entryTime)}</td>
                      <td className="py-3 px-4 text-slate-700">{dateTime(tr.exitTime)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{tr.symbol}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            tr.side === "BUY"
                              ? "bg-emerald-100/80 text-emerald-800"
                              : "bg-rose-100/80 text-rose-800"
                          }`}
                        >
                          {tr.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700 font-mono">
                        {money(tr.entry)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700 font-mono">
                        {money(tr.exit)}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-700 font-mono">{tr.qty}</td>
                      <td
                        className={`py-3 px-4 text-right font-bold font-mono ${pnlColor(tr.pnl)}`}
                      >
                        {signed(tr.pnl)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{money(tr.fees)}</td>
                      <td className="py-3 px-4">
                        {tr.reason?.toLowerCase().includes("target") ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            🎯 Target Hit
                          </span>
                        ) : tr.reason?.toLowerCase().includes("stop") ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                            🛑 Stop-Loss Hit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                            {tr.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {trades.length > 15 && (
                <button
                  className="text-blue-600 font-semibold py-3"
                  onClick={() => setShowAllTrades(!showAllTrades)}
                >
                  {showAllTrades ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              {status === "loading"
                ? "Fetching historical data and calculating trades…"
                : status === "error"
                  ? "The backtest failed. Review the error above and try again."
                  : result
                    ? "No trades occurred for this configuration and data period."
                    : "Run a backtest to view historical trade executions."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
