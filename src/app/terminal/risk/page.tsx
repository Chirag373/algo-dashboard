"use client";

import { useState } from "react";
import { useTerminal } from "@/lib/terminal/store";
import { inr } from "@/lib/terminal/format";
import { Panel, btn, inputCls } from "@/components/terminal/ui";
import type { RiskLimits } from "@/lib/terminal/types";

export default function Risk() {
  const t = useTerminal();
  const [form, setForm] = useState<RiskLimits>(t.risk);
  const [saved, setSaved] = useState(false);

  const errors: string[] = [];
  if (form.maxDailyLoss <= 0) errors.push("Max daily loss must be greater than 0");
  if (form.maxOpenPositions < 1) errors.push("Max open positions must be at least 1");
  if (form.maxCapitalPerTrade <= 0) errors.push("Max capital per trade must be greater than 0");
  if (form.maxCapitalPerTrade > form.totalCapital)
    errors.push("Per-trade capital cannot exceed total capital");
  if (form.maxDailyLoss > form.totalCapital)
    errors.push("Daily loss limit cannot exceed total capital");

  const field = (
    key: keyof RiskLimits,
    label: string,
    help: string,
    type: "number" | "time" = "number"
  ) => (
    <label className="text-xs text-slate-400 space-y-1 block">
      {label}
      <input
        type={type}
        className={inputCls}
        value={form[key]}
        onChange={(e) => {
          setSaved(false);
          setForm({
            ...form,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          });
        }}
      />
      <span className="block text-[11px] text-slate-600">{help}</span>
    </label>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Risk controls</h1>
        <p className="text-sm text-slate-500">
          Enforced on every order, manual or strategy. Limits apply to both paper and live.
        </p>
      </div>

      <Panel title="Limits">
        <div className="p-4 grid md:grid-cols-2 gap-4">
          {field("totalCapital", "Total capital (₹)", "Capital allocated to the terminal")}
          {field(
            "maxDailyLoss",
            "Max daily loss (₹)",
            "Kill switch engages and positions close when day P&L reaches this loss"
          )}
          {field(
            "maxOpenPositions",
            "Max open positions",
            "New orders are rejected beyond this count"
          )}
          {field(
            "maxCapitalPerTrade",
            "Max capital per trade (₹)",
            "Order value above this is rejected"
          )}
          {field(
            "autoSquareOffTime",
            "Auto square-off time",
            "All intraday positions close at this time",
            "time"
          )}
        </div>
      </Panel>

      {errors.length > 0 && (
        <div
          role="alert"
          className="border border-rose-800 bg-rose-950/50 rounded-lg p-3 text-xs text-rose-300"
        >
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={errors.length > 0}
          onClick={() => {
            t.updateRisk(form);
            setSaved(true);
          }}
          className={`${btn} bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5`}
        >
          Save limits
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>

      <Panel title="Emergency controls">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <button
            onClick={t.toggleKill}
            className={`${btn} py-2.5 px-4 ${t.killed ? "bg-slate-700 text-white" : "bg-red-600 hover:bg-red-500 text-white"}`}
          >
            {t.killed ? "Release kill switch" : "Engage kill switch"}
          </button>
          <button
            disabled={t.positions.length === 0}
            onClick={t.squareOffAll}
            className={`${btn} py-2.5 px-4 bg-rose-800 hover:bg-rose-700 text-white`}
          >
            Square off all ({t.positions.length})
          </button>
          <span className="text-xs text-slate-500">
            Today: {inr(t.dayPnl)} of {inr(t.risk.maxDailyLoss)} loss limit
          </span>
        </div>
      </Panel>
    </div>
  );
}
