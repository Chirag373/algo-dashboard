"use client";

import { useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTerminal, pnlOf } from "@/lib/terminal/store";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";
import { strategyName } from "@/lib/terminal/mock";
import { Badge, Empty, Panel, Stat, td, tdr, th, thr } from "@/components/terminal/ui";

export default function Overview() {
  const t = useTerminal();
  const [curve, setCurve] = useState<{ time: string; pnl: number }[]>([]);

  const [lastNow, setLastNow] = useState("");

  // Append one sample per tick (state adjusted during render, not in an effect)
  if (t.now !== lastNow && t.now !== "--:--:--") {
    setLastNow(t.now);
    setCurve((c) => [...c, { time: t.now, pnl: Math.round(t.dayPnl) }].slice(-120));
  }

  const used = t.positions.reduce((s, p) => s + p.avg * p.qty, 0);
  const wins = t.closed.filter((c) => c.pnl > 0).length;
  const winRate = t.closed.length ? (wins / t.closed.length) * 100 : 0;
  const lossUsed = Math.min(100, Math.max(0, (-t.dayPnl / t.risk.maxDailyLoss) * 100));

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Day P&L" value={signed(t.dayPnl)} tone={pnlColor(t.dayPnl)} />
        <Stat label="Open P&L" value={signed(t.openPnl)} tone={pnlColor(t.openPnl)} />
        <Stat label="Realized P&L" value={signed(t.realizedPnl)} tone={pnlColor(t.realizedPnl)} />
        <Stat label="Open positions" value={`${t.positions.length} / ${t.risk.maxOpenPositions}`} />
        <Stat
          label="Capital used"
          value={inr(used)}
          sub={`Free ${inr(Math.max(0, t.risk.totalCapital - used))}`}
        />
        <Stat
          label="Win rate"
          value={t.closed.length ? `${winRate.toFixed(0)}%` : "n/a"}
          sub={`${t.closed.length} closed trade(s)`}
        />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Panel title="Intraday P&L (session)" className="xl:col-span-2">
          <div className="h-64 p-3">
            {curve.length < 2 ? (
              <Empty text="Collecting ticks..." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve}>
                  <defs>
                    <linearGradient id="pl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    domain={["auto", "auto"]}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0d1220",
                      border: "1px solid #1e293b",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke="#3b82f6"
                    fill="url(#pl)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="Daily loss limit">
          <div className="p-4 space-y-3">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Used</span>
              <span className="mono-nums">
                {inr(Math.max(0, -t.dayPnl))} / {inr(t.risk.maxDailyLoss)}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-800 overflow-hidden">
              <div
                className={`h-full ${lossUsed > 75 ? "bg-rose-500" : lossUsed > 40 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${lossUsed}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              At the limit, the kill switch engages automatically and all positions are closed.
            </p>
            <Link href="/terminal/risk" className="text-xs text-blue-400 hover:underline">
              Edit risk limits
            </Link>
          </div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Panel
          title="Open positions"
          className="xl:col-span-2"
          right={
            <Link href="/terminal/trading" className="text-xs text-blue-400 hover:underline">
              Manage
            </Link>
          }
        >
          {t.positions.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-[#0a0e17]">
                  <tr>
                    <th className={th}>Symbol</th>
                    <th className={th}>Strategy</th>
                    <th className={th}>Side</th>
                    <th className={thr}>Qty</th>
                    <th className={thr}>Avg</th>
                    <th className={thr}>LTP</th>
                    <th className={thr}>P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {t.positions.map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} font-semibold text-white`}>{p.symbol}</td>
                      <td className={`${td} text-slate-400`}>
                        {strategyName(p.strategyId, t.strategies)}
                      </td>
                      <td className={td}>
                        <Badge tone={p.side === "BUY" ? "green" : "red"}>{p.side}</Badge>
                      </td>
                      <td className={tdr}>{p.qty}</td>
                      <td className={tdr}>{num(p.avg)}</td>
                      <td className={tdr}>{num(p.ltp)}</td>
                      <td className={`${tdr} font-bold ${pnlColor(pnlOf(p))}`}>
                        {signed(pnlOf(p))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Strategies">
          <ul className="divide-y divide-slate-800/70">
            {t.strategies.map((s) => (
              <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {s.instrument} · {s.timeframe} · v{s.version}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone="blue">{s.stage}</Badge>
                  <Badge
                    tone={
                      s.status === "running" ? "green" : s.status === "paused" ? "amber" : "slate"
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Alerts & activity">
        {t.alerts.length === 0 ? (
          <Empty text="No alerts yet" />
        ) : (
          <ul className="divide-y divide-slate-800/70 text-sm max-h-60 overflow-auto">
            {t.alerts.map((a) => (
              <li key={a.id} className="px-4 py-2 flex gap-3">
                <span className="mono-nums text-slate-500 text-xs pt-0.5">{a.time}</span>
                <Badge
                  tone={a.level === "critical" ? "red" : a.level === "warn" ? "amber" : "blue"}
                >
                  {a.level}
                </Badge>
                <span className="text-slate-300">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
