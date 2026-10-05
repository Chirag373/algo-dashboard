"use client";

import { useMemo, useState } from "react";
import { useTerminal } from "@/lib/terminal/store";
import { syntheticHistory } from "@/lib/terminal/analytics";
import PerformanceView from "@/components/terminal/PerformanceView";
import { Panel, inputCls } from "@/components/terminal/ui";

export default function Analytics() {
  const t = useTerminal();
  const [sel, setSel] = useState("all");

  const days = useMemo(() => {
    if (sel === "all") {
      const parts = t.strategies.map((_, i) => syntheticHistory(100 + i, 60));
      return parts[0].map((d, i) => ({
        ...d,
        pnl: parts.reduce((s, p) => s + p[i].pnl, 0),
        trades: parts.reduce((s, p) => s + p[i].trades, 0),
        wins: parts.reduce((s, p) => s + p[i].wins, 0),
      }));
    }
    const idx = t.strategies.findIndex((s) => s.id === sel);
    return syntheticHistory(100 + Math.max(0, idx), 60);
  }, [sel, t.strategies]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-slate-500">Performance over the last 60 trading days.</p>
        </div>
        <select
          className={`${inputCls} !w-64`}
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          aria-label="Strategy filter"
        >
          <option value="all">All strategies</option>
          {t.strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <Panel>
        <p className="px-4 py-2 text-xs text-amber-300 bg-amber-950/40 rounded-lg">
          Demo data: these figures are synthetic until the backend records real trades.
        </p>
      </Panel>

      <PerformanceView days={days} capital={t.risk.totalCapital} />
    </div>
  );
}
