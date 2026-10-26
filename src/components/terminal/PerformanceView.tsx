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
import type { AnalyticsResult } from "@/utils/analytics";
import { inr, num, pnlColor, signed } from "@/utils/format";
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Net P&L" value={money(m.totalPnl)} tone={pnlColor(m.totalPnl)} />
        <Stat label="Trades" value={String(m.trades)} />
        <Stat label="Win rate" value={percent(m.winRate)} />
      </div>

      <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
        <Panel title="Cumulative P&L">
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
                  dataKey="cumulativePnl"
                  stroke="#22c55e"
                  fill="#22c55e22"
                  dot={curve.length === 1}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Daily P&L">
          <div className="h-64 p-3">
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
    </div>
  );
}
