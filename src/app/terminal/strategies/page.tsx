"use client";

import { useState, useRef, useEffect, Fragment } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  TrendingUp,
  BarChart2,
  Trophy,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Play,
  Square,
  Pencil,
  Trash2,
  Activity,
  History,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Zap,
} from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { inr, signed } from "@/lib/terminal/format";

export default function Strategies() {
  const t = useTerminal();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<Record<string, "live" | "closed" | "orders">>({});
  const [menuAnchor, setMenuAnchor] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClose(event: MouseEvent | Event) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuAnchor(null);
      }
    }
    if (menuAnchor) {
      document.addEventListener("mousedown", handleClose);
      window.addEventListener("scroll", handleClose, true);
      window.addEventListener("resize", handleClose);
    }
    return () => {
      document.removeEventListener("mousedown", handleClose);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [menuAnchor]);

  const totalStrategies = t.strategies.length;
  const activeStrategies = t.strategies.filter((s) => s.status === "running").length;

  // Compute stats per strategy
  const strategiesWithStats = t.strategies.map((s) => {
    const strTrades = t.closed.filter((c) => c.strategyId === s.id);
    const strPos = t.positions.filter((p) => p.strategyId === s.id);
    const realized = strTrades.reduce((acc, c) => acc + c.pnl, 0);
    const unrealized = strPos.reduce(
      (acc, p) => acc + (p.ltp - p.avg) * p.qty * (p.side === "BUY" ? 1 : -1),
      0
    );
    const pnl = realized + unrealized;
    const tradesCount = strTrades.length + strPos.length;
    const wins = strTrades.filter((c) => c.pnl > 0).length;
    const winRate = strTrades.length > 0 ? (wins / strTrades.length) * 100 : 0;

    return { ...s, pnl, tradesCount, winRate };
  });

  // Total Strategy PnL: sum of all strategy PnLs to match table rows exactly
  const totalStrategyPnl = strategiesWithStats.reduce((acc, s) => acc + s.pnl, 0);

  // Best Performing strategy: only consider strategies that have actually traded
  const tradedStrategies = strategiesWithStats.filter((s) => s.tradesCount > 0);
  const bestPerforming =
    tradedStrategies.length > 0
      ? tradedStrategies.reduce(
          (best, cur) => (cur.pnl > best.pnl ? cur : best),
          tradedStrategies[0]
        )
      : null;

  // Compute Realized Max Drawdown
  let maxDrawdown = 0;
  let runningPnl = 0;
  let peakPnl = 0;
  const sortedTrades = [...t.closed].reverse();
  for (const tr of sortedTrades) {
    runningPnl += tr.pnl;
    if (runningPnl > peakPnl) peakPnl = runningPnl;
    const dd = peakPnl - runningPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto flex flex-col space-y-6 text-slate-900 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Strategies</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Create, manage and deploy your algo strategies.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search strategies (e.g. Momentum, RSI, Bank Nifty)"
              className="pl-9 pr-4 py-2 w-[340px] text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 shadow-sm"
            />
          </div>
          <Link
            href="/terminal/strategies/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add New Strategy
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Card 1 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <svg
              className="w-6 h-6 text-purple-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Total Strategies</div>
            <div className="text-xl font-bold mt-0.5">{totalStrategies}</div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Active Strategies</div>
            <div className="text-xl font-bold mt-0.5">{activeStrategies}</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <BarChart2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Total Strategy P&amp;L</div>
            <div
              className={`text-xl font-bold mt-0.5 ${totalStrategyPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {signed(totalStrategyPnl)}
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
              Today: {signed(t.dayPnl)}
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-medium">Best Performing</div>
            {bestPerforming ? (
              <>
                <div className="text-sm font-bold mt-0.5 truncate text-slate-900">{bestPerforming.name}</div>
                <div
                  className={`text-[10px] font-semibold mt-0.5 ${bestPerforming.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {signed(bestPerforming.pnl)} ({bestPerforming.tradesCount} trades)
                </div>
              </>
            ) : (
              <div className="text-sm font-bold mt-0.5 text-slate-400">No trades yet</div>
            )}
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Max Drawdown</div>
            <div className="text-xl font-bold mt-0.5 text-rose-600">
              {maxDrawdown > 0 ? `-${inr(maxDrawdown, 0)}` : "0.0%"}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-[13px] text-slate-700 shadow-sm">
            All Status <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-[13px] text-slate-700 shadow-sm">
            All Symbols <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-[13px] text-slate-700 shadow-sm">
            All Types <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or symbol"
              className="pl-8 pr-3 py-1.5 w-[200px] text-[13px] bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-[13px] text-slate-700 shadow-sm">
            <svg
              className="w-4 h-4 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18" />
              <path d="M7 12h10" />
              <path d="M10 18h4" />
            </svg>
            Sort by: P&L (High to Low) <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] text-left">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
              <tr>
                <th className="py-3 px-4 w-12">
                  <input type="checkbox" className="rounded border-slate-300" />
                </th>
                <th className="py-3 px-4">Strategy Name</th>
                <th className="py-3 px-4">Symbol(s)</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Live P&L</th>
                <th className="py-3 px-4 text-center">Total Trades</th>
                <th className="py-3 px-4 text-center">Win Rate</th>
                <th className="py-3 px-4 text-center">Max DD</th>
                <th className="py-3 px-4 text-center">Start / Stop</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {strategiesWithStats.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    No strategies found.
                  </td>
                </tr>
              )}
              {strategiesWithStats.map((row) => {
                const livePositions = t.positions.filter((p) => p.strategyId === row.id);
                const closedTrades = t.closed.filter((c) => c.strategyId === row.id);
                const strategyOrders = t.orders.filter((o) => o.strategyId === row.id);
                const targetHits = closedTrades.filter((c) => c.reason?.toLowerCase().includes("target")).length;
                const stopHits = closedTrades.filter((c) => c.reason?.toLowerCase().includes("stop")).length;
                const isExpanded = expandedId === row.id;
                const currentTab = detailsTab[row.id] || (livePositions.length > 0 ? "live" : "closed");
                const anyRow = row as any;
                const liveInd = anyRow.liveIndicators;
                const currentPrice = anyRow.currentPrice || t.prices[row.instrument] || 0;

                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      className={`hover:bg-blue-50/40 transition-colors group cursor-pointer ${
                        isExpanded ? "bg-blue-50/20" : ""
                      }`}
                    >
                      <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded border-slate-300" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1 rounded-md transition-transform duration-200 ${
                              isExpanded
                                ? "rotate-90 text-blue-600 bg-blue-100"
                                : "text-slate-400 group-hover:text-slate-600"
                            }`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                              {row.name}
                              <span className="text-[10px] font-normal text-slate-400 group-hover:text-blue-500 underline underline-offset-2">
                                {isExpanded ? "Hide Details" : "Click to view Live Trades & Outcomes"}
                              </span>
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              v{row.version} • {row.timeframe}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-semibold">
                          {row.instrument}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-2 py-1 rounded text-[11px] font-semibold
                        ${row.template === "ORB" ? "bg-orange-50 text-orange-600" : ""}
                        ${row.template === "FinBaba" ? "bg-purple-50 text-purple-600" : ""}
                        ${row.template === "Custom" ? "bg-blue-50 text-blue-600" : ""}
                      `}
                        >
                          {row.template}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              row.status === "running"
                                ? "bg-emerald-500 animate-pulse"
                                : row.status === "paused"
                                  ? "bg-amber-500"
                                  : "bg-slate-400"
                            }`}
                          ></div>
                          <span
                            className={
                              row.status === "running"
                                ? "text-emerald-600 font-semibold capitalize"
                                : row.status === "paused"
                                  ? "text-amber-600 font-medium capitalize"
                                  : "text-slate-500 font-medium capitalize"
                            }
                          >
                            {row.status === "running" ? "Running (Paper)" : row.status}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div
                          className={`font-bold ${row.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                        >
                          {signed(row.pnl)}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-slate-900">
                        {row.tradesCount}
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-slate-900">
                        {row.winRate.toFixed(1)}%
                      </td>
                      <td className="py-4 px-4 text-center text-slate-700">-%</td>
                      <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() =>
                            t.setStrategyStatus(
                              row.id,
                              row.status === "running" ? "stopped" : "running"
                            )
                          }
                          title={row.status === "running" ? "Stop Strategy" : "Start Strategy"}
                          className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-all shadow-sm ${
                            row.status === "running"
                              ? "bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-200"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200"
                          }`}
                        >
                          {row.status === "running" ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuAnchor?.id === row.id) {
                              setMenuAnchor(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuAnchor({
                                id: row.id,
                                top: rect.bottom + 6,
                                right: Math.max(12, window.innerWidth - rect.right),
                              });
                            }
                          }}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all outline-none focus:outline-none focus:ring-0 ${
                            menuAnchor?.id === row.id
                              ? "bg-slate-100 text-slate-900 shadow-sm"
                              : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/80"
                          }`}
                          title="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Trade Details Panel */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <td colSpan={11} className="p-0">
                          <div className="p-5 space-y-4">
                            {/* Live Indicator Status Banner */}
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 p-3.5 rounded-xl border border-blue-100 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  <span className="text-xs font-bold text-slate-900">
                                    Real Market Feed: {row.instrument} @ {inr(currentPrice, 2)}
                                  </span>
                                </div>
                                {liveInd ? (
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="bg-white/80 px-2.5 py-1 rounded-md border border-slate-200 font-semibold text-slate-700">
                                      {liveInd.leftName}: <strong className="text-blue-600">{liveInd.leftValue}</strong>
                                    </span>
                                    <span className="text-slate-500 font-medium">
                                      {liveInd.operator}
                                    </span>
                                    <span className="bg-white/80 px-2.5 py-1 rounded-md border border-slate-200 font-semibold text-slate-700">
                                      {liveInd.rightName}: <strong className="text-purple-600">{liveInd.rightValue}</strong>
                                    </span>
                                    <span className={`px-2.5 py-1 rounded-md font-bold text-[11px] border ${
                                      liveInd.armed
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                    }`}>
                                      {liveInd.armed ? "Armed: Waiting for Crossover" : "Monitoring Market (Lines Crossed)"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-600">
                                    Monitoring live market candles and signals.
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  {targetHits} Target Hit 🎯
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                  {stopHits} Stop-Loss Hit 🛑
                                </span>
                              </div>
                            </div>

                            {/* Navigation Tabs */}
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setDetailsTab((prev) => ({ ...prev, [row.id]: "live" }))}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    currentTab === "live"
                                      ? "bg-blue-600 text-white shadow-sm"
                                      : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                                  }`}
                                >
                                  <Activity className="w-3.5 h-3.5" />
                                  Live Trades ({livePositions.length})
                                </button>
                                <button
                                  onClick={() => setDetailsTab((prev) => ({ ...prev, [row.id]: "closed" }))}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    currentTab === "closed"
                                      ? "bg-blue-600 text-white shadow-sm"
                                      : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                                  }`}
                                >
                                  <History className="w-3.5 h-3.5" />
                                  Executed Trades & Outcomes ({closedTrades.length})
                                </button>
                                <button
                                  onClick={() => setDetailsTab((prev) => ({ ...prev, [row.id]: "orders" }))}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    currentTab === "orders"
                                      ? "bg-blue-600 text-white shadow-sm"
                                      : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                                  }`}
                                >
                                  <ListChecks className="w-3.5 h-3.5" />
                                  Orders Log ({strategyOrders.length})
                                </button>
                              </div>

                              <span className="text-[11px] text-slate-500">
                                Timeframe: <strong>{row.timeframe}</strong> • Real Market Feed
                              </span>
                            </div>

                            {/* TAB 1: Live Trades */}
                            {currentTab === "live" && (
                              livePositions.length > 0 ? (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                                      <tr>
                                        <th className="py-2.5 px-4">Live Status</th>
                                        <th className="py-2.5 px-4">Symbol</th>
                                        <th className="py-2.5 px-4">Side</th>
                                        <th className="py-2.5 px-4">Qty</th>
                                        <th className="py-2.5 px-4">Entry Avg</th>
                                        <th className="py-2.5 px-4">Live LTP</th>
                                        <th className="py-2.5 px-4">Stop-Loss (SL)</th>
                                        <th className="py-2.5 px-4">Target (TP)</th>
                                        <th className="py-2.5 px-4 text-right">Live P&L</th>
                                        <th className="py-2.5 px-4 text-center">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {livePositions.map((pos) => {
                                        const pnl = (pos.ltp - pos.avg) * pos.qty * (pos.side === "BUY" ? 1 : -1);
                                        return (
                                          <tr key={pos.id} className="hover:bg-blue-50/20">
                                            <td className="py-3 px-4">
                                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> LIVE NOW
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-900">{pos.symbol}</td>
                                            <td className="py-3 px-4">
                                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${pos.side === "BUY" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                                {pos.side}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-slate-800">{pos.qty}</td>
                                            <td className="py-3 px-4 font-semibold text-slate-800">{inr(pos.avg)}</td>
                                            <td className="py-3 px-4 font-bold text-blue-600">{inr(pos.ltp)}</td>
                                            <td className="py-3 px-4">
                                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" /> {inr(pos.sl)}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4">
                                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                                <Target className="w-3.5 h-3.5 text-emerald-500" /> {inr(pos.target)}
                                              </span>
                                            </td>
                                            <td className={`py-3 px-4 text-right font-bold text-sm ${pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                              {signed(pnl)}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                              <button
                                                onClick={() => t.closePosition(pos.id)}
                                                className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
                                              >
                                                Square Off
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
                                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
                                    <Activity className="w-5 h-5" />
                                  </div>
                                  <div className="font-bold text-sm text-slate-800">No Active Live Trades Right Now</div>
                                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                    {row.status === "running"
                                      ? "Strategy is actively running on real market data. When your crossover condition triggers on a live bar, the open trade with real-time Target and Stop-Loss tracking will appear here."
                                      : "Strategy is currently stopped. Click 'Play' above to start monitoring and paper trading."}
                                  </p>
                                </div>
                              )
                            )}

                            {/* TAB 2: Executed Trades (Target / Stoploss / Squareoff) */}
                            {currentTab === "closed" && (
                              closedTrades.length > 0 ? (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                                      <tr>
                                        <th className="py-2.5 px-4">Closed Time</th>
                                        <th className="py-2.5 px-4">Symbol</th>
                                        <th className="py-2.5 px-4">Side</th>
                                        <th className="py-2.5 px-4">Qty</th>
                                        <th className="py-2.5 px-4">Entry Price</th>
                                        <th className="py-2.5 px-4">Exit Price</th>
                                        <th className="py-2.5 px-4">Trigger / Outcome</th>
                                        <th className="py-2.5 px-4 text-right">Net P&L</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {closedTrades.map((c) => {
                                        const isTarget = c.reason?.toLowerCase().includes("target");
                                        const isStop = c.reason?.toLowerCase().includes("stop");
                                        const isSquareOff = c.reason?.toLowerCase().includes("square");
                                        const isRule = c.reason?.toLowerCase().includes("rule") || c.reason?.toLowerCase().includes("custom");

                                        return (
                                          <tr key={c.id} className="hover:bg-slate-50/70">
                                            <td className="py-3 px-4 font-medium text-slate-500">{c.closedAt}</td>
                                            <td className="py-3 px-4 font-bold text-slate-900">{c.symbol}</td>
                                            <td className="py-3 px-4">
                                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${c.side === "BUY" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                                {c.side}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-slate-800">{c.qty}</td>
                                            <td className="py-3 px-4 font-semibold text-slate-800">{inr(c.entry)}</td>
                                            <td className="py-3 px-4 font-semibold text-slate-800">{inr(c.exit)}</td>
                                            <td className="py-3 px-4">
                                              {isTarget ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Target Hit 🎯
                                                </span>
                                              ) : isStop ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Stop-Loss Hit 🛑
                                                </span>
                                              ) : isSquareOff ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                                  <Clock className="w-3.5 h-3.5 text-amber-600" /> Auto Square-Off ⏰
                                                </span>
                                              ) : isRule ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs">
                                                  <Zap className="w-3.5 h-3.5 text-blue-600" /> Exit Rule Satisfied ⚡
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                                  {c.reason || "Manual Exit"}
                                                </span>
                                              )}
                                            </td>
                                            <td className={`py-3 px-4 text-right font-bold text-sm ${c.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                              {signed(c.pnl)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
                                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
                                    <History className="w-5 h-5" />
                                  </div>
                                  <div className="font-bold text-sm text-slate-800">No Executed Trades Yet</div>
                                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                    When the strategy enters and exits trades (hitting Target Profit, Stop-Loss, or Square-off), they will be logged here with complete execution outcome details.
                                  </p>
                                </div>
                              )
                            )}

                            {/* TAB 3: Orders Log */}
                            {currentTab === "orders" && (
                              strategyOrders.length > 0 ? (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                                      <tr>
                                        <th className="py-2.5 px-4">Time</th>
                                        <th className="py-2.5 px-4">Symbol</th>
                                        <th className="py-2.5 px-4">Side</th>
                                        <th className="py-2.5 px-4">Type</th>
                                        <th className="py-2.5 px-4">Qty</th>
                                        <th className="py-2.5 px-4">Price</th>
                                        <th className="py-2.5 px-4">Status</th>
                                        <th className="py-2.5 px-4">Execution Note</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {strategyOrders.map((o) => (
                                        <tr key={o.id} className="hover:bg-slate-50/70">
                                          <td className="py-2.5 px-4 font-medium text-slate-500">{o.time}</td>
                                          <td className="py-2.5 px-4 font-bold text-slate-900">{o.symbol}</td>
                                          <td className="py-2.5 px-4">
                                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${o.side === "BUY" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                              {o.side}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-4 text-slate-600">{o.type}</td>
                                          <td className="py-2.5 px-4 font-semibold text-slate-800">{o.qty}</td>
                                          <td className="py-2.5 px-4 font-semibold text-slate-800">{inr(o.price)}</td>
                                          <td className="py-2.5 px-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              o.status === "COMPLETE"
                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                : o.status === "REJECTED"
                                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                                : "bg-slate-100 text-slate-600"
                                            }`}>
                                              {o.status}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-4 text-slate-600 font-medium">{o.note || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
                                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
                                    <ListChecks className="w-5 h-5" />
                                  </div>
                                  <div className="font-bold text-sm text-slate-800">No Orders Placed Yet</div>
                                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                    Market and limit orders generated by this strategy will appear here.
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modern Floating Action Dropdown Menu */}
      {menuAnchor && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: `${menuAnchor.top}px`,
            right: `${menuAnchor.right}px`,
          }}
          className="w-48 bg-white rounded-xl shadow-[0_10px_35px_-5px_rgba(15,23,42,0.15),0_0_1px_1px_rgba(15,23,42,0.06)] p-1.5 z-[9999] animate-in fade-in zoom-in-95 duration-150 outline-none"
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400">
            Strategy Actions
          </div>
          <Link
            href={`/terminal/strategies/${menuAnchor.id}`}
            onClick={() => setMenuAnchor(null)}
            className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors group"
          >
            <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </div>
            <span>Edit Strategy</span>
          </Link>

          <Link
            href={`/terminal/backtest?strategyId=${menuAnchor.id}`}
            onClick={() => setMenuAnchor(null)}
            className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors group"
          >
            <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <Play className="w-3.5 h-3.5 fill-current" />
            </div>
            <span>Backtest Strategy</span>
          </Link>

          <div className="my-1 h-px bg-slate-100" />

          <button
            onClick={() => {
              const strId = menuAnchor.id;
              const targetStr = t.strategies.find((s) => s.id === strId);
              setMenuAnchor(null);
              if (confirm(`Are you sure you want to delete "${targetStr?.name || "this strategy"}"?`)) {
                t.deleteStrategy(strId);
              }
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50/80 rounded-lg transition-colors group text-left"
          >
            <div className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 group-hover:bg-rose-100 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
            <span>Delete Strategy</span>
          </button>
        </div>
      )}
    </div>
  );
}
