"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeMetrics, equityCurve, type DayResult } from "@/lib/terminal/analytics";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";
import { Panel, Stat } from "./ui";

const tip = { background: "#0d1220", border: "1px solid #1e293b", fontSize: 12 };

export default function PerformanceView({ days, capital }: { days: DayResult[]; capital: number }) {
  const m = computeMetrics(days, capital);
  const curve = equityCurve(days);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat label="Net P&L" value={signed(m.totalPnl)} tone={pnlColor(m.totalPnl)} />
        <Stat label="Trades" value={String(m.trades)} />
        <Stat label="Win rate" value={`${m.winRate.toFixed(1)}%`} />
        <Stat
          label="Profit factor"
          value={Number.isFinite(m.profitFactor) ? num(m.profitFactor) : "∞"}
        />
        <Stat label="Max drawdown" value={`${m.maxDrawdown.toFixed(2)}%`} tone="text-rose-400" />
        <Stat label="Sharpe (ann.)" value={num(m.sharpe)} />
        <Stat label="Avg winning day" value={inr(m.avgWin)} tone="text-emerald-400" />
        <Stat label="Avg losing day" value={inr(m.avgLoss)} tone="text-rose-400" />
        <Stat
          label="Expectancy / trade"
          value={signed(m.expectancy)}
          tone={pnlColor(m.expectancy)}
        />
        <Stat label="Best day" value={signed(m.bestDay)} tone="text-emerald-400" />
        <Stat label="Worst day" value={signed(m.worstDay)} tone="text-rose-400" />
        <Stat label="Return on capital" value={`${((m.totalPnl / capital) * 100).toFixed(2)}%`} />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Equity curve">
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={50} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={60} />
                <Tooltip contentStyle={tip} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#22c55e"
                  fill="#22c55e22"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Drawdown">
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={50} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={60} />
                <Tooltip contentStyle={tip} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#f43f5e"
                  fill="#f43f5e22"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Daily P&L">
        <div className="h-56 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={50} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={60} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="pnl" isAnimationActive={false}>
                {days.map((d) => (
                  <Cell key={d.date} fill={d.pnl >= 0 ? "#22c55e" : "#f43f5e"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
