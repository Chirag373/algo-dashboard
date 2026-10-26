"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/utils/api";
import { num, pnlColor } from "@/utils/format";
import { Panel } from "./ui";

type Period = "1D" | "1W" | "1M" | "3M";
interface ChartData {
  period: Period;
  interval: string;
  data: { time: number; open: number; high: number; low: number; close: number }[];
  lastPrice: number;
  change: number;
  changePct: number;
  changeLabel: string;
  asOf: number;
  source: string;
}
const dateTime = (time: number) =>
  new Date(time * 1000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function NiftyChart() {
  const [period, setPeriod] = useState<Period>("1D");
  const [result, setResult] = useState<ChartData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      setLoading(true);
      try {
        const data = await api<ChartData>("GET", `/market/nifty?period=${period}`, undefined, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResult(data);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Unable to load NIFTY history");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, 60000);
        }
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [period, retry]);

  const chart = result?.period === period ? result : null;
  return (
    <Panel
      title="NIFTY 50 · Price chart"
      right={
        <div className="flex gap-1" aria-label="Chart period">
          {(["1D", "1W", "1M", "3M"] as const).map((p) => (
            <button
              key={p}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${p === period ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {p}
            </button>
          ))}
        </div>
      }
    >
      <div className="px-6 pb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-xl font-bold text-slate-900">
          {chart ? num(chart.lastPrice) : "—"}
        </span>
        {chart && (
          <span className={`text-xs font-semibold ${pnlColor(chart.change)}`}>
            {chart.change > 0 ? "+" : ""}
            {num(chart.change)} ({chart.changePct > 0 ? "+" : ""}
            {chart.changePct.toFixed(2)}%){" "}
            <span className="text-slate-400 font-normal">{chart.changeLabel}</span>
          </span>
        )}
        {loading && (
          <span role="status" className="text-xs text-slate-400">
            Updating…
          </span>
        )}
      </div>
      {error && (
        <div role="alert" className="mx-6 mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          {error} {chart && "Showing the last successful update."}{" "}
          <button onClick={() => setRetry((r) => r + 1)} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      )}
      <div className="px-3" style={{ height: 310 }}>
        {!chart ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            {loading ? "Loading NIFTY market history…" : "No market data available"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart.data} margin={{ top: 10, right: 12, left: 4, bottom: 5 }}>
              <defs>
                <linearGradient id="nifty-price" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="time"
                minTickGap={60}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(time) =>
                  new Date(Number(time) * 1000).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    ...(period === "1D"
                      ? { hour: "2-digit", minute: "2-digit" }
                      : { day: "2-digit", month: "short" }),
                  })
                }
              />
              <YAxis
                domain={["auto", "auto"]}
                orientation="right"
                width={80}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => num(Number(v), 0)}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(time) => dateTime(Number(time))}
                formatter={(value) => [num(Number(value)), "NIFTY 50"]}
                contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }}
              />
              <Area
                type="linear"
                dataKey="close"
                stroke="#2563eb"
                fill="url(#nifty-price)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100">
        {chart
          ? `${chart.source} · ${chart.interval} candles · Last candle ${dateTime(chart.asOf)} IST · Refreshes every minute`
          : "Exchange price history appears when the provider is available."}
      </p>
    </Panel>
  );
}
