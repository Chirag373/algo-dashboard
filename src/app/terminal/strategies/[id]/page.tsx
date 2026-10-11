"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { INDICATORS } from "@/lib/terminal/mock";
import { Empty, Panel, Select, inputCls } from "@/components/terminal";
import type { ParamValue, Rule, Strategy } from "@/lib/terminal/types";

const INSTRUMENTS_LIST = ["NIFTY 50", "BANKNIFTY", "Stocks", "Options"];
const TIMEFRAMES_LIST = ["1m", "5m", "15m", "1h"];
const OPERATORS_LIST = ["crosses above", "crosses below", "greater than", "less than", "equals"];

function emptyRule(): Rule {
  return { indicator: "EMA 9", operator: "crosses above", value: "EMA 21" };
}

function RuleBuilder({ rules, onChange }: { rules: Rule[]; onChange: (r: Rule[]) => void }) {
  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <Empty text="No conditions. Add at least one." />
      ) : (
        <div className="space-y-3">
          {rules.map((r, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100"
            >
              <span className="text-[12px] font-bold text-slate-500 w-8 text-center">
                {i === 0 ? "IF" : "AND"}
              </span>
              <Select
                className="w-[140px]"
                value={r.indicator}
                onChange={(val) =>
                  onChange(rules.map((x, j) => (j === i ? { ...x, indicator: val } : x)))
                }
                options={INDICATORS.map((o) => ({ value: o, label: o }))}
              />
              <Select
                className="w-[140px]"
                value={r.operator}
                onChange={(val) =>
                  onChange(rules.map((x, j) => (j === i ? { ...x, operator: val } : x)))
                }
                options={OPERATORS_LIST.map((o) => ({ value: o, label: o }))}
              />
              <input
                className={`${inputCls} !w-[140px]`}
                value={r.value}
                placeholder="value or indicator"
                onChange={(e) =>
                  onChange(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
              />
              <button
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md ml-auto transition-colors"
                title="Remove condition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => onChange([...rules, emptyRule()])}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" /> Add condition
      </button>
    </div>
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
        template: "Custom",
        instrument: "NIFTY 50",
        timeframe: "5m",
        stage: "Draft",
        status: "stopped",
        version: 1,
        params: { stopLoss: 1, targetProfit: 2, quantity: 100 },
        entryRules: [emptyRule()],
        exitRules: [],
      }
  );
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!form.name.trim()) e.push("Name is required");
    if (form.entryRules && form.entryRules.length === 0)
      e.push("At least one entry condition is required");
    return e;
  }, [form]);

  if (!existing && !isNew) {
    return (
      <Panel>
        <Empty text="Strategy not found." />
      </Panel>
    );
  }
  if (existing?.status === "running") {
    return (
      <Panel>
        <div className="p-6 text-sm text-slate-500 space-y-3 text-center">
          <p>This strategy is currently running. You must stop it before editing.</p>
          <Link
            href="/terminal/strategies"
            className="inline-block px-4 py-2 bg-slate-100 text-slate-800 rounded-lg font-medium hover:bg-slate-200"
          >
            Back to strategies
          </Link>
        </div>
      </Panel>
    );
  }

  const setParam = (key: string, value: ParamValue) =>
    setForm((f) => ({ ...f, params: { ...f.params, [key]: value } }));

  const save = () => {
    setTouched(true);
    if (errors.length) return;
    t.saveStrategy({ ...form, name: form.name.trim() }, isNew);
    router.push("/terminal/strategies");
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto flex flex-col space-y-6 text-slate-900 pb-8">
      <div>
        <Link
          href="/terminal/strategies"
          className="text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          ← Back to Strategies
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          {isNew ? "Create a Strategy" : `Edit: ${existing?.name}`}
        </h1>
        {!isNew && (
          <p className="text-sm text-slate-500 mt-1">
            Saving creates version v{(existing?.version ?? 0) + 1}.
          </p>
        )}
      </div>

      <Panel className="p-8">
        {/* Question 1 */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex gap-3">
            <span className="text-blue-600">1.</span> What is your strategy name?
          </h2>
          <div className="mt-4 ml-7">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Example: NIFTY Momentum"
            />
          </div>
        </div>
        <div className="border-t border-slate-100"></div>
        {/* Question 2 & 3 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex gap-3">
              <span className="text-blue-600">2.</span> What do you want to trade?
            </h2>
            <div className="mt-4 ml-7">
              <Select
                value={form.instrument}
                onChange={(val) => setForm({ ...form, instrument: val })}
                options={INSTRUMENTS_LIST.map((i) => ({ value: i, label: i }))}
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900 flex gap-3">
              <span className="text-blue-600">3.</span> Which timeframe do you want?
            </h2>
            <div className="mt-4 ml-7">
              <Select
                value={form.timeframe}
                onChange={(val) => setForm({ ...form, timeframe: val })}
                options={TIMEFRAMES_LIST.map((t) => ({ value: t, label: t }))}
              />
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100"></div>
        {/* Question 4 */}{" "}
        <div className="mt-10">
          <h2 className="text-lg font-bold text-slate-900 flex gap-3">
            <span className="text-blue-600">4.</span> When should the strategy enter a trade?
          </h2>
          <p className="text-[13px] text-slate-500 ml-7 mt-1 mb-4">
            Visual condition builder (Example: EMA 9 crosses above EMA 21)
          </p>
          <div className="ml-7">
            <RuleBuilder
              rules={form.entryRules ?? []}
              onChange={(rules) => setForm({ ...form, entryRules: rules })}
            />
          </div>
        </div>
        <div className="border-t border-slate-100"></div>
        {/* Question 5 */}{" "}
        <div className="mt-10">
          <h2 className="text-lg font-bold text-slate-900 flex gap-3">
            <span className="text-blue-600">5.</span> How should the strategy exit and manage risk?
          </h2>
          <p className="text-[13px] text-slate-500 ml-7 mt-1 mb-4">Simple settings</p>
          <div className="ml-7 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Stop loss %</label>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={form.params.stopLoss as number}
                onChange={(e) => setParam("stopLoss", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Target profit %</label>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={form.params.targetProfit as number}
                onChange={(e) => setParam("targetProfit", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Quantity</label>
              <input
                type="number"
                className={inputCls}
                value={form.params.quantity as number}
                onChange={(e) => setParam("quantity", Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </Panel>

      {touched && errors.length > 0 && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-sm font-medium border border-rose-200">
          <ul className="list-disc pl-5 space-y-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={save}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm text-center"
        >
          {isNew ? "Create Strategy" : "Save Changes"}
        </button>
        <Link
          href="/terminal/strategies"
          className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-colors shadow-sm text-center"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
