"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useTerminal, pnlOf } from "@/lib/terminal/store";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";
import { Badge, Empty, Panel, Stat, td, tdr, th, thr } from "@/components/terminal";
import { TrendingUp, Wallet, List, Trophy, MoreVertical, ShieldCheck } from "lucide-react";

export default function Overview() {
  const t = useTerminal();
  const [curve, setCurve] = useState<{ time: string; pnl: number }[]>([]);
  const [lastNow, setLastNow] = useState("");

  if (t.now !== lastNow && t.now !== "--:--:--") {
    setLastNow(t.now);
    setCurve((c) => [...c, { time: t.now, pnl: Math.round(t.dayPnl) }].slice(-120));
  }

  const wins = t.closed.filter((c) => c.pnl > 0).length;
  const winRate = t.closed.length ? (wins / t.closed.length) * 100 : 0;
  const lossUsed = Math.min(100, Math.max(0, (-t.dayPnl / t.risk.maxDailyLoss) * 100));

  const longPositions = t.positions.filter((p) => p.side === "BUY").length;
  const shortPositions = t.positions.filter((p) => p.side === "SELL").length;

  return (
    <div className="max-w-[1600px] w-full mx-auto flex flex-col space-y-6 text-slate-900 pb-8">
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-0.5">Welcome back, Trader! 👋</h1>
          <p className="text-slate-500 text-[13px]">Your algorithms are running smoothly.</p>
        </div>
        <div className="text-slate-500 text-xs font-medium">
          Wed, 7 Oct 2024 &nbsp;&nbsp; 5:36 PM
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat
          label="Day P&L"
          value={signed(t.dayPnl)}
          tone="text-emerald-600"
          sub={<span className="text-emerald-600">+1.28% Today</span>}
          icon={<TrendingUp className="w-6 h-6 text-emerald-500" />}
        />
        <Stat
          label="Open P&L"
          value={signed(t.openPnl)}
          tone="text-emerald-600"
          sub={<span className="text-emerald-600">+0.72%</span>}
          icon={<Wallet className="w-6 h-6 text-blue-500" />}
        />
        <Stat
          label="Open Positions"
          value={t.positions.length.toString()}
          tone="text-slate-800"
          sub={
            <span className="text-slate-500 font-normal">
              {longPositions} Long &nbsp;|&nbsp; {shortPositions} Short
            </span>
          }
          icon={<List className="w-6 h-6 text-purple-500" />}
        />
        <Stat
          label="Win Rate"
          value={t.closed.length ? `${winRate.toFixed(0)}%` : "0%"}
          tone="text-slate-800"
          sub={
            <span className="text-slate-500 font-normal">
              {wins} / {t.closed.length || 0} trades
            </span>
          }
          icon={<Trophy className="w-6 h-6 text-amber-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Panel>
            <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-50 p-1 rounded-md">
                  <BarChartIcon className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="text-[13px] font-bold text-slate-800">NIFTY 50</h2>
                <div className="text-xs font-semibold text-slate-700">
                  24,932.10 <span className="text-emerald-500">+302.40 (+1.23%)</span>
                </div>
              </div>
              <div className="flex gap-1 text-[11px] font-semibold">
                <button className="px-3 py-1 bg-blue-600 text-white rounded">1D</button>
                <button className="px-3 py-1 text-slate-500 hover:bg-slate-100 rounded">1W</button>
                <button className="px-3 py-1 text-slate-500 hover:bg-slate-100 rounded">1M</button>
                <button className="px-3 py-1 text-slate-500 hover:bg-slate-100 rounded">3M</button>
              </div>
            </div>

            <div className="p-3" style={{ height: 280 }}>
              {curve.length < 2 ? (
                <Empty text="Collecting ticks..." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={curve}>
                    <defs>
                      <linearGradient id="pl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      minTickGap={40}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      domain={["auto", "auto"]}
                      width={50}
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: 12,
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pnl"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#pl)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <section className="bg-white border border-slate-100 shadow-sm rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
              <h2 className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Daily Loss Limit
              </h2>
              <Link
                href="/terminal/risk"
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-slate-500">Used</span>
                <span className="font-bold text-slate-900">
                  {inr(Math.max(0, -t.dayPnl))}{" "}
                  <span className="text-slate-400 font-normal">/ {inr(t.risk.maxDailyLoss)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden relative">
                  <div
                    className={`h-full absolute left-0 top-0 rounded-full ${lossUsed > 75 ? "bg-rose-500" : lossUsed > 40 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.max(2, lossUsed)}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-slate-500">
                  {lossUsed.toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                At the limit, all strategies will be stopped automatically.
              </p>
            </div>
          </section>

          <section className="bg-white border border-slate-100 shadow-sm rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
              <h2 className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5">
                <BarChartIcon className="w-4 h-4 text-blue-600" />
                Strategies <span className="text-blue-600">({t.strategies.length})</span>
              </h2>
              <Link
                href="/terminal/strategies"
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                Manage
              </Link>
            </div>
            <ul className="divide-y divide-slate-50 flex-1 overflow-y-auto">
              {t.strategies.map((s) => (
                <li
                  key={s.id}
                  className="px-4 py-2 flex items-center justify-between gap-2 hover:bg-slate-50/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === "running" ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                    <div className="font-semibold text-slate-900 text-xs truncate">{s.name}</div>
                    <div className="text-[10px] text-slate-400 whitespace-nowrap">
                      {s.instrument} · {s.timeframe}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-xs font-bold text-emerald-600">+₹ 0</div>
                    <button className="text-slate-400 hover:text-slate-600">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <Panel
        title={
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-1 rounded-md">
              <BarChartIcon className="w-4 h-4 text-blue-600" />
            </div>
            Open Positions <span className="text-blue-600">({t.positions.length})</span>
          </div>
        }
        right={
          <Link
            href="/terminal/trading"
            className="text-[11px] font-semibold text-blue-600 hover:underline"
          >
            View All
          </Link>
        }
      >
        {t.positions.length === 0 ? (
          <Empty text="No open positions" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 border-y border-slate-100">
                <tr>
                  <th className={th}>Symbol</th>
                  <th className={th}>Type</th>
                  <th className={thr}>Qty</th>
                  <th className={thr}>Avg. Price</th>
                  <th className={thr}>LTP</th>
                  <th className={thr}>P&amp;L</th>
                  <th className={thr}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.positions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className={`${td} font-bold text-slate-900`}>{p.symbol}</td>
                    <td className={td}>
                      <Badge tone={p.side === "BUY" ? "green" : "red"}>{p.side}</Badge>
                    </td>
                    <td className={tdr}>{p.qty}</td>
                    <td className={tdr}>{num(p.avg)}</td>
                    <td className={tdr}>{num(p.ltp)}</td>
                    <td
                      className={`${tdr} font-bold ${pnlColor(pnlOf(p)).replace("text-emerald-400", "text-emerald-600").replace("text-rose-400", "text-rose-600")}`}
                    >
                      {signed(pnlOf(p))}
                    </td>
                    <td className={tdr}>
                      <div className="flex justify-end items-center gap-2">
                        <button className="px-2.5 py-0.5 bg-blue-50 text-blue-600 text-[11px] font-semibold rounded hover:bg-blue-100 transition-colors">
                          Exit
                        </button>
                        <button className="p-1 text-slate-400 hover:text-slate-600">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BarChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  );
}
