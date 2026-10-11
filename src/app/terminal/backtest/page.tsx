"use client";

import { useState } from "react";
import { useTerminal } from "@/lib/terminal/store";
import { syntheticHistory, type DayResult } from "@/lib/terminal/analytics";
import PerformanceView from "@/components/terminal/PerformanceView";
import { Panel, btn, inputCls, Select } from "@/components/terminal/ui";

export default function Backtest() {
  const t = useTerminal();
  const [strategyId, setStrategyId] = useState(t.strategies[0]?.id ?? "");
  const [days, setDays] = useState(60);
  const [capital, setCapital] = useState(300000);
  const [slippage, setSlippage] = useState(0.05);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DayResult[] | null>(null);

  const error =
    days < 5 || days > 250
      ? "Days must be between 5 and 250"
      : capital < 10000
        ? "Capital must be at least ₹10,000"
        : null;

  const run = () => {
    if (error) return;
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      const idx = Math.max(
        0,
        t.strategies.findIndex((s) => s.id === strategyId)
      );
      setResult(syntheticHistory(500 + idx * 7 + days, days, Math.max(0, 0.1 - slippage)));
      setRunning(false);
    }, 900);
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto flex flex-col space-y-6 text-slate-900 pb-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Backtest</h1>
        <p className="text-sm text-slate-500">
          Test a strategy on historical data before it goes to Paper or Live.
        </p>
      </div>

      <Panel title="Configuration">
        <div className="p-4 grid md:grid-cols-4 gap-4">
          <label className="text-xs text-slate-600 space-y-1 md:col-span-2">
            Strategy
            <Select
              className="mt-1"
              value={strategyId}
              onChange={setStrategyId}
              options={t.strategies.map((s) => ({
                value: s.id,
                label: `${s.name} (v${s.version})`,
              }))}
            />
          </label>
          <label className="text-xs text-slate-600 space-y-1">
            Trading days
            <input
              type="number"
              className={inputCls}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-slate-600 space-y-1">
            Capital (₹)
            <input
              type="number"
              className={inputCls}
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
            />
          </label>
          <label className="text-xs text-slate-600 space-y-1">
            Slippage %
            <input
              type="number"
              step={0.01}
              min={0}
              className={inputCls}
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="px-4 pb-4 flex items-center gap-3">
          <button
            onClick={run}
            disabled={running || !!error || !strategyId}
            className={`${btn} bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5`}
          >
            {running ? "Running..." : "Run backtest"}
          </button>
          {error && <span className="text-xs text-rose-400">{error}</span>}
        </div>
      </Panel>

      <div className="px-4 py-3 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
        <svg
          className="w-4 h-4 text-amber-600 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        Simulated results: the backtest engine is not connected yet, so these numbers are synthetic
        and must not be used to judge a strategy.
      </div>

      {result && <PerformanceView days={result} capital={capital} />}
    </div>
  );
}
