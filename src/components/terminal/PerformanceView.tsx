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
import type { AnalyticsResult } from "@/lib/terminal/analytics";
import styles from "@/app/terminal/dashboard.module.css";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";
import { Panel, Stat } from "./ui";

const tip = {
  background: "#ffffff",
  border: "none",
  fontSize: 12,
  color: "#0f172a",
  borderRadius: "12px",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)",
};

export default function PerformanceView({ result }: { result: AnalyticsResult }) {
  const { metrics: m, days } = result;
  const curve = days;
  const money = (value: number | null) => (value === null ? "—" : signed(value, 2));
  const percent = (value: number | null) => (value === null ? "—" : `${value.toFixed(2)}%`);
  const number = (value: number | null) => (value === null ? "—" : num(value));

  return (
    <div className="space-y-4">
      <div className={styles.summaryGrid}>
        <Stat label="Net P&L" value={money(m.totalPnl)} tone={pnlColor(m.totalPnl)} />
        <Stat label="Trades" value={String(m.trades)} />
        <Stat label="Win rate" value={percent(m.winRate)} />
        <Stat label="Profit factor" value={m.profitFactorInfinite ? "∞" : number(m.profitFactor)} />
        <Stat
          label="Max drawdown"
          value={percent(m.maxDrawdown)}
          sub={inr(m.maxDrawdownAmount, 2)}
          tone="text-rose-600"
        />
        <Stat label="Sharpe · Active days (ann.)" value={number(m.sharpe)} />
        <Stat label="Avg winning day" value={money(m.avgWin)} tone="text-emerald-600" />
        <Stat label="Avg losing day" value={money(m.avgLoss)} tone="text-rose-600" />
        <Stat
          label="Expectancy / trade"
          value={money(m.expectancy)}
          tone={pnlColor(m.expectancy ?? 0)}
        />
        <Stat label="Best day" value={money(m.bestDay)} tone={pnlColor(m.bestDay ?? 0)} />
        <Stat label="Worst day" value={money(m.worstDay)} tone={pnlColor(m.worstDay ?? 0)} />
        <Stat label="Return on capital" value={percent(m.returnPct)} />
      </div>

      <div className={styles.positionsGrid}>
        <Panel title="Realized equity · Daily close">
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={50} />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(value) => num(Number(value), 0)}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  width={85}
                />
                <Tooltip contentStyle={tip} formatter={(value) => inr(Number(value), 2)} />
                <Area
                  type="linear"
                  dataKey="equity"
                  stroke="#22c55e"
                  fill="#22c55e22"
                  dot={curve.length === 1}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Daily closing drawdown (₹)">
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={50} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={60} />
                <Tooltip contentStyle={tip} formatter={(value) => inr(Number(value), 2)} />
                <Area
                  type="linear"
                  dataKey="drawdown"
                  stroke="#f43f5e"
                  fill="#f43f5e22"
                  dot={curve.length === 1}
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
              <Tooltip contentStyle={tip} formatter={(value) => inr(Number(value), 2)} />
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
