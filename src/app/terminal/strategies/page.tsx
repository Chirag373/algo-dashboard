"use client";

import Link from "next/link";
import { Copy, Pencil, Play, Pause, Square, Trash2, Plus } from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { Badge, Empty, Panel, btn } from "@/components/terminal/ui";
import type { Strategy, StrategyStage } from "@/lib/terminal/types";

const NEXT_STAGE: Record<StrategyStage, StrategyStage | null> = {
  Draft: "Backtest",
  Backtest: "Paper",
  Paper: "Live",
  Live: null,
};

export default function Strategies() {
  const t = useTerminal();

  const remove = (s: Strategy) => {
    if (s.status === "running") return;
    if (window.confirm(`Delete "${s.name}"? This cannot be undone.`)) t.deleteStrategy(s.id);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Strategies</h1>
          <p className="text-sm text-slate-500">
            Lifecycle: Draft → Backtest → Paper → Live. A strategy must be stopped before editing or
            promoting.
          </p>
        </div>
        <Link
          href="/terminal/strategies/new"
          className={`${btn} bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 py-2`}
        >
          <Plus className="w-4 h-4" /> New strategy
        </Link>
      </div>

      {t.strategies.length === 0 ? (
        <Panel>
          <Empty text="No strategies yet. Create your first one." />
        </Panel>
      ) : (
        <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {t.strategies.map((s) => {
            const next = NEXT_STAGE[s.stage];
            const running = s.status === "running";
            return (
              <Panel key={s.id}>
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-white">{s.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s.template} · {s.instrument} · {s.timeframe} · v{s.version}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge tone="blue">{s.stage}</Badge>
                      <Badge tone={running ? "green" : s.status === "paused" ? "amber" : "slate"}>
                        {s.status}
                      </Badge>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(s.params)
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <div
                          key={k}
                          className="flex justify-between border-b border-slate-800/60 py-1"
                        >
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="mono-nums text-slate-300">{String(v)}</dd>
                        </div>
                      ))}
                  </dl>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {!running ? (
                      <button
                        onClick={() => t.setStrategyStatus(s.id, "running")}
                        disabled={s.stage === "Draft" || s.stage === "Backtest"}
                        title={
                          s.stage === "Draft" || s.stage === "Backtest"
                            ? "Promote to Paper before running"
                            : "Start"
                        }
                        className={`${btn} bg-emerald-700 hover:bg-emerald-600 text-white flex items-center gap-1`}
                      >
                        <Play className="w-3.5 h-3.5" /> Start
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => t.setStrategyStatus(s.id, "paused")}
                          className={`${btn} bg-amber-700 hover:bg-amber-600 text-white flex items-center gap-1`}
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                        <button
                          onClick={() => t.setStrategyStatus(s.id, "stopped")}
                          className={`${btn} bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1`}
                        >
                          <Square className="w-3.5 h-3.5" /> Stop
                        </button>
                      </>
                    )}
                    {s.status === "paused" && (
                      <button
                        onClick={() => t.setStrategyStatus(s.id, "stopped")}
                        className={`${btn} bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1`}
                      >
                        <Square className="w-3.5 h-3.5" /> Stop
                      </button>
                    )}
                    {next && !running && (
                      <button
                        onClick={() => t.promoteStrategy(s.id, next)}
                        className={`${btn} border border-blue-700 text-blue-300 hover:bg-blue-900/30`}
                      >
                        Promote to {next}
                      </button>
                    )}
                    <div className="ml-auto flex gap-1.5">
                      <Link
                        href={`/terminal/strategies/${s.id}`}
                        aria-label="Edit strategy"
                        className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => t.cloneStrategy(s.id)}
                        aria-label="Clone strategy"
                        className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(s)}
                        disabled={running}
                        aria-label="Delete strategy"
                        className={`${btn} bg-slate-800 hover:bg-rose-900 text-slate-200`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
