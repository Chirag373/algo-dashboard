"use client";

import Link from "next/link";
import {
  Search,
  Plus,
  TrendingUp,
  BarChart2,
  Trophy,
  ShieldAlert,
  ChevronDown,
  MoreVertical,
} from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { signed } from "@/lib/terminal/format";

export default function Strategies() {
  const t = useTerminal();

  const totalStrategies = t.strategies.length;
  const activeStrategies = t.strategies.filter((s) => s.status === "running").length;
  const totalPnl = t.dayPnl; // or openPnl + realizedPnl

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

  const bestPerforming =
    strategiesWithStats.length > 0
      ? strategiesWithStats.reduce(
          (best, cur) => (cur.pnl > best.pnl ? cur : best),
          strategiesWithStats[0]
        )
      : null;

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
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
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
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Active Strategies</div>
            <div className="text-xl font-bold mt-0.5">{activeStrategies}</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <BarChart2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Total P&L (Day)</div>
            <div
              className={`text-xl font-bold mt-0.5 ${totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {signed(totalPnl)}
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-medium">Best Performing</div>
            <div className="text-sm font-bold mt-0.5 truncate">{bestPerforming?.name || "N/A"}</div>
            {bestPerforming && (
              <div
                className={`text-[10px] font-semibold ${bestPerforming.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {signed(bestPerforming.pnl)}
              </div>
            )}
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Max Drawdown</div>
            <div className="text-xl font-bold mt-0.5 text-rose-600">N/A</div>
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
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {strategiesWithStats.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No strategies found.
                  </td>
                </tr>
              )}
              {strategiesWithStats.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 group">
                  <td className="py-4 px-4">
                    <input type="checkbox" className="rounded border-slate-300" />
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-bold text-slate-900">{row.name}</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      v{row.version} • {row.timeframe}
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
                        className={`w-2 h-2 rounded-full ${row.status === "running" ? "bg-emerald-500" : row.status === "paused" ? "bg-amber-500" : "bg-slate-400"}`}
                      ></div>
                      <span
                        className={
                          row.status === "running"
                            ? "text-emerald-600 font-medium capitalize"
                            : row.status === "paused"
                              ? "text-amber-600 font-medium capitalize"
                              : "text-slate-500 font-medium capitalize"
                        }
                      >
                        {row.status}
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
                  <td className="py-4 px-4 text-center">
                    <button className="text-slate-400 hover:text-slate-700">
                      <MoreVertical className="w-4 h-4 mx-auto" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
