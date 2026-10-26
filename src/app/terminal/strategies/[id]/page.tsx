"use client";

import { MultiSelect } from "@/components/terminal/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTerminal } from "@/components/terminal/context";
import { Empty, Panel, Select, inputCls } from "@/components/terminal";
import { api } from "@/utils/api";
import { STANDARD_TIMEFRAMES } from "@/defaults";
import { RuleBuilder } from "@/components/terminal/RuleBuilder";
import { emptyRule, parseIndicatorField } from "@/utils/rules";
import type { ParamValue, Strategy } from "@/types";

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
        instrument: "TCS",
        timeframe: "5m",
        stage: "Draft",
        status: "stopped",
        version: 1,
        params: {
          stopLoss: 1,
          stopLossPercent: 1,
          targetProfit: 2,
          targetPercent: 2,
          quantity: 100,
          perTradeAmount: 10000,
          squareOffTime: "15:15",
        },
        entryRules: [emptyRule()],
        exitRules: [],
      }
  );
  const forwardPut = form.params.executionAction === "forward_put";
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Indian assets state
  const [indianAssets, setIndianAssets] = useState<
    { symbol: string; name: string; exchange?: string }[]
  >([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Custom timeframe state
  const [customTf, setCustomTf] = useState("");
  const [customSelected, setCustomSelected] = useState(false);
  const loadedId = useRef(existing?.id);
  useEffect(() => {
    if (existing && loadedId.current !== existing.id) {
      loadedId.current = existing.id;
      setForm(existing);
    }
  }, [existing]);
  const isCustomTimeframe =
    customSelected || !["1m", "5m", "15m", "30m", "1h", "4h"].includes(form.timeframe);

  // Load Indian assets on mount
  useEffect(() => {
    let active = true;
    async function loadAssets() {
      setLoadingAssets(true);
      try {
        const data = await api<{ assets: { symbol: string; name: string; exchange?: string }[] }>(
          "GET",
          "/assets?limit=30000"
        );
        if (active) setIndianAssets(data.assets);
      } catch (error) {
        if (active)
          setServerError(error instanceof Error ? error.message : "Unable to load Indian stocks");
        // Keep built-in Indian choices available
      } finally {
        if (active) setLoadingAssets(false);
      }
    }
    loadAssets();
    return () => {
      active = false;
    };
  }, []);

  const instrumentOptions = useMemo(
    () =>
      indianAssets.map((stock) => ({
        value: stock.symbol,
        label: `${stock.symbol} • ${stock.name} (${stock.exchange})`,
      })),
    [indianAssets]
  );

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!(form.instruments ?? [form.instrument]).length || !form.instrument)
      e.push("Select at least one stock or index");
    if (!form.name.trim()) e.push("Name is required");
    if (form.entryRules && form.entryRules.length === 0)
      e.push("At least one entry condition is required");
    if (!Number.isInteger(Number(form.params.quantity)) || Number(form.params.quantity) <= 0)
      e.push("Quantity must be a positive integer");
    if (
      forwardPut &&
      (!Number.isInteger(Number(form.params.optionLots ?? 1)) ||
        Number(form.params.optionLots ?? 1) < 1 ||
        Number(form.params.optionLots ?? 1) > 1000)
    )
      e.push("Option lots must be a whole number from 1 to 1000");
    if (Number(form.params.stopLossPercent ?? form.params.stopLoss) <= 0)
      e.push("Stop loss must be positive");
    if (Number(form.params.targetPercent ?? form.params.targetProfit) <= 0)
      e.push("Target profit must be positive");
    for (const rule of [...(form.entryRules ?? []), ...(form.exitRules ?? [])]) {
      const left = parseIndicatorField(rule.indicator);
      const right = parseIndicatorField(rule.value);
      if (
        left.type === "RSI" &&
        (right.type !== "Number" ||
          !rule.value.trim() ||
          !Number.isFinite(Number(rule.value)) ||
          Number(rule.value) < 0 ||
          Number(rule.value) > 100)
      ) {
        e.push("Enter an RSI level between 0 and 100.");
      }
      if (
        left.source !== "stock" &&
        left.type === "Price" &&
        (right.type !== "Number" ||
          !rule.value.trim() ||
          !Number.isFinite(Number(rule.value)) ||
          Number(rule.value) < 0)
      )
        e.push(
          left.source === "USDINR"
            ? "Enter a non-negative USD/INR level."
            : "Enter a non-negative India VIX level."
        );
      for (const operand of [left, right]) {
        if (
          ["EMA", "SMA", "RSI"].includes(operand.type) &&
          (!Number.isInteger(operand.period) || operand.period < 1 || operand.period > 500)
        ) {
          e.push("Indicator periods must be whole numbers from 1 to 500 candles.");
        }
      }
    }
    return e;
  }, [form, forwardPut]);

  if (!existing && !isNew) {
    return (
      <Panel>
        <Empty text="Strategy not found." />
      </Panel>
    );
  }
  if (existing && existing.template !== "Custom") {
    return (
      <Panel>
        <div className="p-6 space-y-3 text-sm text-slate-600">
          <p>
            {existing.template} uses its dedicated execution settings. Create a Custom strategy to
            configure visual conditions.
          </p>
          <Link href="/terminal/strategies/new" className="text-blue-600">
            Create a Custom strategy
          </Link>
        </div>
      </Panel>
    );
  }
  if (existing && existing.status !== "stopped") {
    return (
      <Panel>
        <div className="p-6 text-sm text-slate-500 space-y-3 text-center">
          <p>Stop this strategy and close its positions before editing.</p>
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

  const save = async () => {
    setTouched(true);
    setServerError(null);
    if (errors.length) return;
    setSaving(true);
    try {
      const payload: Strategy = {
        ...form,
        name: form.name.trim(),
        template: form.template || "Custom",
        timeframe: isCustomTimeframe ? customTf.trim() || form.timeframe : form.timeframe,
        params: {
          ...form.params,
          quantity: Number(form.params.quantity ?? 100),
          ...(forwardPut ? { optionLots: Number(form.params.optionLots ?? 1) } : {}),
          stopLossPercent: Number(form.params.stopLossPercent ?? form.params.stopLoss ?? 1),
          targetPercent: Number(form.params.targetPercent ?? form.params.targetProfit ?? 2),
          perTradeAmount: Math.max(100, Number(form.params.quantity || 100) * 100),
          squareOffTime: (form.params.squareOffTime as string) || "15:15",
        },
        entryRules: form.entryRules && form.entryRules.length > 0 ? form.entryRules : [emptyRule()],
        exitRules: form.exitRules ?? [],
      };
      const res = await t.saveStrategy(payload, isNew);
      if (res.ok) {
        router.push("/terminal/strategies");
      } else {
        setServerError(res.message);
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
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
        <div className="border-t border-slate-100 my-10"></div>

        {/* Question 2 & 3 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex gap-3">
                <span className="text-blue-600">2.</span> What do you want to trade?
              </h2>
              {loadingAssets && (
                <span className="text-xs text-blue-600 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
                  Loading assets...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 ml-7 mt-1.5 mb-4">
              Select Indian company stocks. Search by symbol or company name.
            </p>
            <div className="ml-7 space-y-3">
              <MultiSelect
                values={form.instruments ?? [form.instrument]}
                onChange={(instruments) =>
                  setForm({
                    ...form,
                    instruments,
                    instrument: instruments[0] ?? "",
                    params: { ...form.params, market: "IN" },
                  })
                }
                options={instrumentOptions}
              />
              <p className="text-xs text-slate-400">
                {forwardPut
                  ? "Entry indicators use each selected underlying. Option lots apply to each underlying separately."
                  : "Saved quantity applies to each selected stock."}
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900 flex gap-3">
              <span className="text-blue-600">3.</span> Which timeframe do you want?
            </h2>
            <p className="text-xs text-slate-500 ml-7 mt-1.5 mb-4">
              1m, 5m, 15m, 30m, 1h, 4h, or custom timeframe
            </p>
            <div className="ml-7 space-y-3">
              <Select
                value={isCustomTimeframe ? "custom" : form.timeframe}
                onChange={(val) => {
                  setCustomSelected(val === "custom");
                  if (val === "custom") {
                    setCustomTf("10m");
                    setForm({ ...form, timeframe: "10m" });
                  } else {
                    setForm({ ...form, timeframe: val });
                  }
                }}
                options={STANDARD_TIMEFRAMES}
              />

              {/* Custom Timeframe input box */}
              {isCustomTimeframe && (
                <div className="flex items-center gap-2 pt-2 animate-in fade-in">
                  <span className="text-xs font-semibold text-slate-600">Custom:</span>
                  <input
                    type="text"
                    className="w-32 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500 shadow-sm"
                    placeholder="e.g. 2m, 10m, 2h"
                    value={customTf || form.timeframe}
                    onChange={(e) => {
                      setCustomTf(e.target.value);
                      setForm({ ...form, timeframe: e.target.value });
                    }}
                  />
                  <span className="text-[11px] text-slate-400">
                    (Examples: 2m, 3m, 10m, 2h, 1d)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 my-10"></div>

        {/* Question 4 */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex gap-3">
            <span className="text-blue-600">4.</span> When should the strategy enter a trade?
          </h2>
          <p className="text-[13px] text-slate-500 ml-7 mt-1 mb-4">
            Conditions use completed candles. AND is evaluated before OR. Opening range uses the
            first candle of the selected timeframe; Supertrend uses ATR 10 × 3.
          </p>
          <div className="ml-7 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Trade action when entry conditions match
                  <Select
                    aria-label="Strategy trade action"
                    value={String(form.params.executionAction ?? "buy_underlying")}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        name:
                          current.name || (value === "forward_put" ? "Forward Put Builder" : ""),
                        params: {
                          ...current.params,
                          executionAction: value,
                          optionLots: current.params.optionLots ?? 1,
                          ...(value === "forward_put"
                            ? { optionExpiryMonths: current.params.optionExpiryMonths ?? 2 }
                            : {}),
                        },
                      }))
                    }
                    options={[
                      { value: "buy_underlying", label: "Buy selected stock / index" },
                      { value: "forward_put", label: "Forward Put Builder" },
                    ]}
                  />
                </label>
                {forwardPut && (
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                    How far forward?
                    <Select
                      aria-label="Forward put expiry month"
                      value={String(form.params.optionExpiryMonths ?? "legacy")}
                      onChange={(value) => {
                        if (value !== "legacy") setParam("optionExpiryMonths", Number(value));
                      }}
                      options={[
                        ...(form.params.optionExpiryMonths == null
                          ? [{ value: "legacy", label: "60–90 days (saved rule)" }]
                          : []),
                        { value: "0", label: "This month" },
                        { value: "1", label: "Next month" },
                        { value: "2", label: "2 months forward" },
                      ]}
                    />
                  </label>
                )}
              </div>
              {forwardPut && (
                <div className="space-y-2 text-sm text-slate-600">
                  <p>
                    Sell a put in Paper Trading at the{" "}
                    <strong>15th listed strike strictly above the current underlying price</strong>,
                    using the earliest active expiry{" "}
                    {form.params.optionExpiryMonths == null ? (
                      <strong>60–90 calendar days away</strong>
                    ) : (
                      <strong>
                        {Number(form.params.optionExpiryMonths) === 0
                          ? "in this calendar month"
                          : Number(form.params.optionExpiryMonths) === 1
                            ? "in the next calendar month"
                            : "in the calendar month 2 months ahead"}
                      </strong>
                    )}
                    .
                  </p>
                  <p className="text-xs">
                    Requires Kite quotes. If the expiry, 15th strike, or sufficient fresh bid/ask
                    depth is unavailable, that signal is skipped and logged. Conditions must reset
                    before another entry.
                  </p>
                  <p className="text-xs">
                    Quantity is in whole lots. Stop loss and target use the option premium; the
                    saved daily square-off time still applies. Paper capital reserves strike ×
                    quantity; historical backtesting for this action is unavailable.
                  </p>
                </div>
              )}
            </div>
            <RuleBuilder
              rules={form.entryRules ?? []}
              onChange={(rules) => setForm({ ...form, entryRules: rules })}
            />
          </div>
        </div>
        <div className="border-t border-slate-100 my-10"></div>

        {/* Question 5 */}
        <div>
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
                value={Number(form.params.stopLossPercent ?? form.params.stopLoss ?? 1)}
                onChange={(e) => setParam("stopLossPercent", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Target profit %</label>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={Number(form.params.targetPercent ?? form.params.targetProfit ?? 2)}
                onChange={(e) => setParam("targetPercent", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">
                {forwardPut ? "Option lots per underlying" : "Quantity"}
              </label>
              <input
                type="number"
                className={inputCls}
                aria-label={forwardPut ? "Option lots per underlying" : "Strategy quantity"}
                min={1}
                max={forwardPut ? 1000 : 1000000}
                step={1}
                value={Number(forwardPut ? (form.params.optionLots ?? 1) : form.params.quantity)}
                onChange={(e) =>
                  setParam(forwardPut ? "optionLots" : "quantity", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>
        <div className="mt-8 ml-7 space-y-3">
          <h3 className="font-semibold">Optional exit conditions</h3>
          <p className="text-xs text-slate-500">
            Stop loss and target always protect open positions, including while paused or stopped.
          </p>
          <RuleBuilder
            purpose="exit"
            rules={form.exitRules ?? []}
            onChange={(rules) => setForm({ ...form, exitRules: rules })}
          />
          <p className="text-sm text-blue-700">
            Saving automatically starts Paper Trading. One entry per signal; conditions must reset
            before another entry.
          </p>
        </div>
      </Panel>

      {((touched && errors.length > 0) || serverError) && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-sm font-medium border border-rose-200">
          <ul className="list-disc pl-5 space-y-1">
            {touched && errors.map((e, i) => <li key={i}>{e}</li>)}
            {serverError && <li>{serverError}</li>}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Link
          href="/terminal/strategies"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-semibold text-sm rounded-xl transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          Back
        </Link>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all shadow-sm text-center"
        >
          {saving
            ? "Saving..."
            : isNew
              ? "Create & Start Paper Trading"
              : "Save & Start Paper Trading"}
        </button>
      </div>
    </div>
  );
}
