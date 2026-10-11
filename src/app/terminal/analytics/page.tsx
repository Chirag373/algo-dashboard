"use client";

import { useMemo, useState } from "react";
import { useTerminal } from "@/lib/terminal/store";
import { syntheticHistory } from "@/lib/terminal/analytics";
import PerformanceView from "@/components/terminal/PerformanceView";
import { Select } from "@/components/terminal";

export default function Analytics() {
  const t = useTerminal();
  const [sel, setSel] = useState("all");

  const days = useMemo(() => {
    if (sel === "all") {
      if (t.strategies.length === 0) return [];
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
    <div className="max-w-[1600px] w-full mx-auto flex flex-col space-y-6 text-slate-900 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500">Performance over the last 60 trading days.</p>
        </div>
        <Select
          className="w-64"
          value={sel}
          onChange={setSel}
          options={[
            { value: "all", label: "All strategies" },
            ...t.strategies.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </div>

      <p className="px-4 py-3 text-[13px] font-medium text-amber-800 bg-amber-50 border border-amber-200/60 rounded-xl">
        Demo data: these figures are synthetic until the backend records real trades.
      </p>

      <PerformanceView days={days} capital={t.risk.totalCapital} />
    </div>
  );
}
