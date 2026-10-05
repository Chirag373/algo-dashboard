"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { INDICATORS, INSTRUMENTS, OPERATORS, TIMEFRAMES } from "@/lib/terminal/mock";
import { Empty, Panel, btn, inputCls } from "@/components/terminal/ui";
import type { ParamValue, Rule, Strategy, StrategyTemplate } from "@/lib/terminal/types";

interface ParamDef {
  key: string;
  label: string;
  type: "number" | "text" | "time";
  step?: number;
  min?: number;
  max?: number;
  help?: string;
}

const TEMPLATE_PARAMS: Record<StrategyTemplate, ParamDef[]> = {
  ORB: [
    {
      key: "rangeCandleCount",
      label: "Range candle count",
      type: "number",
      min: 1,
      max: 30,
      help: "Candles that form the opening range",
    },
    {
      key: "initialSlPercent",
      label: "Initial SL %",
      type: "number",
      step: 0.1,
      min: 0.1,
      max: 20,
    },
    { key: "tslLockPercent", label: "TSL lock %", type: "number", step: 0.1, min: 0, max: 20 },
    { key: "tslTrailStep", label: "TSL trail step %", type: "number", step: 0.1, min: 0, max: 10 },
    { key: "perTradeAmount", label: "Per-trade amount (₹)", type: "number", min: 100 },
    { key: "maxTradesPerStock", label: "Max trades per stock", type: "number", min: 1, max: 20 },
    { key: "squareOffTime", label: "Square-off time", type: "time" },
  ],
  FinBaba: [
    { key: "isl", label: "ISL (points)", type: "number", min: 1 },
    { key: "csl", label: "CSL (points)", type: "number", min: 1 },
    { key: "level", label: "Level (L0–L4)", type: "text" },
    { key: "lots", label: "Lots", type: "number", min: 1, max: 100 },
    { key: "squareOffTime", label: "Square-off time", type: "time" },
  ],
  Custom: [
    { key: "stopLossPercent", label: "Stop-loss %", type: "number", step: 0.1, min: 0.1, max: 50 },
    { key: "targetPercent", label: "Target %", type: "number", step: 0.1, min: 0.1, max: 100 },
    { key: "perTradeAmount", label: "Per-trade amount (₹)", type: "number", min: 100 },
    { key: "squareOffTime", label: "Square-off time", type: "time" },
  ],
};

const DEFAULTS: Record<StrategyTemplate, Record<string, ParamValue>> = {
  ORB: {
    rangeCandleCount: 5,
    initialSlPercent: 2,
    tslLockPercent: 1.5,
    tslTrailStep: 0.5,
    perTradeAmount: 10000,
    maxTradesPerStock: 2,
    squareOffTime: "15:19",
  },
  FinBaba: { isl: 50, csl: 30, level: "L0", lots: 1, squareOffTime: "15:15" },
  Custom: { stopLossPercent: 1, targetPercent: 2, perTradeAmount: 10000, squareOffTime: "15:15" },
};

const emptyRule = (): Rule => ({ indicator: INDICATORS[0], operator: OPERATORS[0], value: "" });

function RuleEditor({
  title,
  rules,
  onChange,
}: {
  title: string;
  rules: Rule[];
  onChange: (r: Rule[]) => void;
}) {
  return (
    <Panel
      title={title}
      right={
        <button
          onClick={() => onChange([...rules, emptyRule()])}
          className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1`}
        >
          <Plus className="w-3.5 h-3.5" /> Add condition
        </button>
      }
    >
      {rules.length === 0 ? (
        <Empty text="No conditions. Add at least one." />
      ) : (
        <div className="p-4 space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500 w-10">{i === 0 ? "IF" : "AND"}</span>
              <select
                className={`${inputCls} !w-auto`}
                value={r.indicator}
                aria-label="Indicator"
                onChange={(e) =>
                  onChange(rules.map((x, j) => (j === i ? { ...x, indicator: e.target.value } : x)))
                }
              >
                {INDICATORS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <select
                className={`${inputCls} !w-auto`}
                value={r.operator}
                aria-label="Operator"
                onChange={(e) =>
                  onChange(rules.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))
                }
              >
                {OPERATORS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <input
                className={`${inputCls} !w-40`}
                value={r.value}
                placeholder="value or indicator"
                aria-label="Value"
                onChange={(e) =>
                  onChange(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
              />
              <button
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
                aria-label="Remove condition"
                className="text-slate-500 hover:text-rose-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function StrategyEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTerminal();
  const existing = t.strategies.find((s) => s.id === id);
  const isNew = id === "new";

  const [form, setForm] = useState<Strategy>(
    () =>
      existing ?? {
        id: `s-${Date.now()}`,
        name: "",
        template: "ORB",
        instrument: INSTRUMENTS[0],
        timeframe: "5m",
        stage: "Draft",
        status: "stopped",
        version: 1,
        params: { ...DEFAULTS.ORB },
        entryRules: [],
        exitRules: [],
      }
  );
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!form.name.trim()) e.push("Name is required");
    for (const d of TEMPLATE_PARAMS[form.template]) {
      const v = form.params[d.key];
      if (v === "" || v === undefined) e.push(`${d.label} is required`);
      else if (d.type === "number") {
        const n = Number(v);
        if (Number.isNaN(n)) e.push(`${d.label} must be a number`);
        else if (d.min !== undefined && n < d.min) e.push(`${d.label} must be at least ${d.min}`);
        else if (d.max !== undefined && n > d.max) e.push(`${d.label} must be at most ${d.max}`);
      }
    }
    if (form.template === "FinBaba" && !/^L[0-4]$/.test(String(form.params.level ?? "")))
      e.push("Level must be L0 to L4");
    if (form.template === "Custom") {
      if (!form.entryRules?.length) e.push("Add at least one entry condition");
      if (!form.exitRules?.length) e.push("Add at least one exit condition");
      [...(form.entryRules ?? []), ...(form.exitRules ?? [])].forEach((r) => {
        if (!r.value.trim()) e.push("Every condition needs a value");
      });
    }
    return Array.from(new Set(e));
  }, [form]);

  if (!isNew && !existing) {
    return (
      <Panel>
        <Empty text="Strategy not found." />
      </Panel>
    );
  }
  if (existing?.status === "running") {
    return (
      <Panel>
        <div className="p-6 text-sm text-slate-300 space-y-3">
          <p>This strategy is running. Stop it before editing.</p>
          <Link href="/terminal/strategies" className="text-blue-400 hover:underline">
            Back to strategies
          </Link>
        </div>
      </Panel>
    );
  }

  const setParam = (key: string, value: ParamValue) =>
    setForm((f) => ({ ...f, params: { ...f.params, [key]: value } }));

  const changeTemplate = (tpl: StrategyTemplate) =>
    setForm((f) => ({
      ...f,
      template: tpl,
      params: { ...DEFAULTS[tpl] },
      entryRules: tpl === "Custom" ? (f.entryRules ?? []) : [],
      exitRules: tpl === "Custom" ? (f.exitRules ?? []) : [],
    }));

  const save = () => {
    setTouched(true);
    if (errors.length) return;
    const params: Record<string, ParamValue> = {};
    for (const d of TEMPLATE_PARAMS[form.template])
      params[d.key] = d.type === "number" ? Number(form.params[d.key]) : form.params[d.key];
    t.saveStrategy({ ...form, name: form.name.trim(), params });
    router.push("/terminal/strategies");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <Link href="/terminal/strategies" className="text-xs text-blue-400 hover:underline">
          ← Strategies
        </Link>
        <h1 className="text-xl font-bold text-white mt-1">
          {isNew ? "New strategy" : `Edit: ${existing?.name}`}
        </h1>
        {!isNew && (
          <p className="text-xs text-slate-500">
            Saving creates version v{(existing?.version ?? 0) + 1}.
          </p>
        )}
      </div>

      <Panel title="Basics">
        <div className="p-4 grid md:grid-cols-2 gap-4">
          <label className="text-xs text-slate-400 space-y-1 md:col-span-2">
            Name
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. ORB Nifty Morning"
            />
          </label>
          <label className="text-xs text-slate-400 space-y-1">
            Template
            <select
              className={inputCls}
              value={form.template}
              disabled={!isNew}
              onChange={(e) => changeTemplate(e.target.value as StrategyTemplate)}
            >
              <option value="ORB">ORB (opening range breakout)</option>
              <option value="FinBaba">FinBaba (levels)</option>
              <option value="Custom">Custom (rule builder)</option>
            </select>
          </label>
          <label className="text-xs text-slate-400 space-y-1">
            Instrument
            <select
              className={inputCls}
              value={form.instrument}
              onChange={(e) => setForm({ ...form, instrument: e.target.value })}
            >
              {INSTRUMENTS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400 space-y-1">
            Timeframe
            <select
              className={inputCls}
              value={form.timeframe}
              onChange={(e) => setForm({ ...form, timeframe: e.target.value })}
            >
              {TIMEFRAMES.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      <Panel title="Parameters">
        <div className="p-4 grid md:grid-cols-2 gap-4">
          {TEMPLATE_PARAMS[form.template].map((d) => (
            <label key={d.key} className="text-xs text-slate-400 space-y-1">
              {d.label}
              <input
                className={inputCls}
                type={d.type}
                step={d.step}
                min={d.min}
                max={d.max}
                value={String(form.params[d.key] ?? "")}
                onChange={(e) => setParam(d.key, e.target.value)}
              />
              {d.help && <span className="block text-[11px] text-slate-600">{d.help}</span>}
            </label>
          ))}
        </div>
      </Panel>

      {form.template === "Custom" && (
        <>
          <RuleEditor
            title="Entry conditions (all must be true)"
            rules={form.entryRules ?? []}
            onChange={(r) => setForm({ ...form, entryRules: r })}
          />
          <RuleEditor
            title="Exit conditions (any can trigger)"
            rules={form.exitRules ?? []}
            onChange={(r) => setForm({ ...form, exitRules: r })}
          />
        </>
      )}

      {touched && errors.length > 0 && (
        <div
          role="alert"
          className="border border-rose-800 bg-rose-950/50 rounded-lg p-3 text-xs text-rose-300"
        >
          <ul className="list-disc pl-4 space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={save}
          className={`${btn} bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5`}
        >
          {isNew ? "Create strategy (Draft)" : "Save new version"}
        </button>
        <Link
          href="/terminal/strategies"
          className={`${btn} text-slate-400 hover:text-white py-2.5`}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
