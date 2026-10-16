"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, X, ArrowLeft } from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { Empty, Panel, Select, inputCls } from "@/components/terminal";
import { api } from "@/lib/terminal/api";
import { INDICATOR_TYPES, OPERATORS_LIST, STANDARD_TIMEFRAMES } from "@/config/defaults";
import type { ParamValue, Rule, Strategy } from "@/lib/terminal/types";

// Helper to parse indicator string into { type, period }
function parseIndicatorField(raw: string) {
  if (!raw) return { type: "EMA", period: 9 };
  const str = raw.trim();
  const match = str.match(/^(EMA|SMA|RSI)\s*\(?(\d+)?\)?$/i);
  if (match) {
    return {
      type: match[1].toUpperCase(),
      period: match[2]
        ? Number(match[2])
        : match[1].toUpperCase() === "EMA"
          ? 9
          : match[1].toUpperCase() === "RSI"
            ? 14
            : 20,
    };
  }
  // Check if it's purely a number
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(str)) {
    return { type: "Number", period: Number(str) };
  }
  // Standard indicator without period
  const found = INDICATOR_TYPES.find((i) => i.value.toLowerCase() === str.toLowerCase());
  if (found) {
    return { type: found.value, period: found.defaultPeriod || 0 };
  }
  return { type: str, period: 9 };
}

function formatIndicatorString(type: string, period?: number | string) {
  if (type === "Number") return String(period ?? 0);
  if (["EMA", "SMA", "RSI"].includes(type)) {
    return `${type} ${period ?? (type === "EMA" ? 9 : type === "RSI" ? 14 : 20)}`;
  }
  return type;
}

function emptyRule(): Rule {
  return { indicator: "EMA 9", operator: "crosses above", value: "EMA 21" };
}

function RuleBuilder({ rules, onChange }: { rules: Rule[]; onChange: (r: Rule[]) => void }) {
  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <Empty text="No conditions. Add at least one condition." />
      ) : (
        <div className="space-y-3">
          {rules.map((r, i) => {
            const leftParsed = parseIndicatorField(r.indicator);
            const rightParsed = parseIndicatorField(r.value);

            return (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 shadow-sm"
              >
                {i === 0 ? (
                  <span className="text-xs font-bold text-slate-500 w-9 text-center">IF</span>
                ) : (
                  <Select
                    className="w-20"
                    value={r.connector ?? "AND"}
                    onChange={(connector) =>
                      onChange(
                        rules.map((x, j) =>
                          j === i ? { ...x, connector: connector as "AND" | "OR" } : x
                        )
                      )
                    }
                    options={[
                      { value: "AND", label: "AND" },
                      { value: "OR", label: "OR" },
                    ]}
                  />
                )}

                {/* Left Side: Indicator Selection */}
                <div className="flex items-center gap-1.5">
                  <Select
                    className="w-[140px]"
                    value={leftParsed.type}
                    onChange={(val) => {
                      const def =
                        INDICATOR_TYPES.find((t) => t.value === val)?.defaultPeriod ??
                        leftParsed.period;
                      const newInd = formatIndicatorString(val, def);
                      onChange(rules.map((x, j) => (j === i ? { ...x, indicator: newInd } : x)));
                    }}
                    options={INDICATOR_TYPES.map((o) => ({ value: o.value, label: o.label }))}
                  />

                  {/* Left Side: Number/Period Input beside indicator if applicable */}
                  {["EMA", "SMA", "RSI", "Number"].includes(leftParsed.type) && (
                    <div className="relative w-16">
                      <input
                        type="number"
                        min={leftParsed.type === "Number" ? undefined : 1}
                        step={leftParsed.type === "Number" ? "any" : 1}
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500 text-center shadow-sm"
                        placeholder={leftParsed.type === "EMA" ? "9" : "20"}
                        value={leftParsed.period}
                        onChange={(e) => {
                          const num = Number(e.target.value);
                          const newInd = formatIndicatorString(leftParsed.type, num);
                          onChange(
                            rules.map((x, j) => (j === i ? { ...x, indicator: newInd } : x))
                          );
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Operator Selection */}
                <Select
                  className="w-[145px]"
                  value={r.operator}
                  onChange={(val) =>
                    onChange(rules.map((x, j) => (j === i ? { ...x, operator: val } : x)))
                  }
                  options={OPERATORS_LIST.map((o) => ({ value: o, label: o }))}
                />

                {/* Right Side: Indicator Selection */}
                <div className="flex items-center gap-1.5">
                  <Select
                    className="w-[140px]"
                    value={rightParsed.type}
                    onChange={(val) => {
                      const def =
                        INDICATOR_TYPES.find((t) => t.value === val)?.defaultPeriod ??
                        (val === "EMA" ? 21 : 20);
                      const newVal = formatIndicatorString(val, def);
                      onChange(rules.map((x, j) => (j === i ? { ...x, value: newVal } : x)));
                    }}
                    options={INDICATOR_TYPES.map((o) => ({ value: o.value, label: o.label }))}
                  />

                  {/* Right Side: Number/Period Input beside indicator if applicable */}
                  {["EMA", "SMA", "RSI", "Number"].includes(rightParsed.type) && (
                    <div className="relative w-16">
                      <input
                        type="number"
                        min={rightParsed.type === "Number" ? undefined : 1}
                        step={rightParsed.type === "Number" ? "any" : 1}
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500 text-center shadow-sm"
                        placeholder={rightParsed.type === "EMA" ? "21" : "20"}
                        value={rightParsed.period}
                        onChange={(e) => {
                          const num = Number(e.target.value);
                          const newVal = formatIndicatorString(rightParsed.type, num);
                          onChange(rules.map((x, j) => (j === i ? { ...x, value: newVal } : x)));
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Remove Condition Button */}
                <button
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg ml-auto transition-colors"
                  title="Remove condition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...rules, emptyRule()])}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Condition
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
        instrument: "NIFTY",
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
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Alpaca assets state
  const [alpacaAssets, setAlpacaAssets] = useState<
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

  // Load Alpaca assets on mount
  useEffect(() => {
    let active = true;
    async function loadAssets() {
      setLoadingAssets(true);
      try {
        const data = await api<{ assets: { symbol: string; name: string; exchange?: string }[] }>(
          "GET",
          "/assets?limit=250"
        );
        if (active) setAlpacaAssets(data.assets);
      } catch {
        // Fallback default
      } finally {
        if (active) setLoadingAssets(false);
      }
    }
    loadAssets();
    return () => {
      active = false;
    };
  }, []);

  const filteredAssets = alpacaAssets;

  const instrumentOptions = useMemo(() => {
    const indianIndices = [
      { value: "NIFTY 50", label: "NIFTY 50 (Index)" },
      { value: "BANKNIFTY", label: "BANKNIFTY (Nifty Bank Index)" },
      { value: "FINNIFTY", label: "FINNIFTY (Financial Services)" },
      { value: "SENSEX", label: "SENSEX (BSE Index)" },
      { value: "NIFTY 50 Stocks", label: "NIFTY 50 Stocks (Basket)" },
    ];

    const topIndianEquities = [
      { value: "RELIANCE", label: "RELIANCE • Reliance Industries" },
      { value: "TCS", label: "TCS • Tata Consultancy Services" },
      { value: "HDFCBANK", label: "HDFCBANK • HDFC Bank" },
      { value: "INFY", label: "INFY • Infosys" },
      { value: "ICICIBANK", label: "ICICIBANK • ICICI Bank" },
      { value: "SBIN", label: "SBIN • State Bank of India" },
      { value: "BHARTIARTL", label: "BHARTIARTL • Bharti Airtel" },
      { value: "ITC", label: "ITC • ITC Ltd" },
      { value: "KOTAKBANK", label: "KOTAKBANK • Kotak Mahindra Bank" },
      { value: "LT", label: "LT • Larsen & Toubro" },
      { value: "AXISBANK", label: "AXISBANK • Axis Bank" },
      { value: "TATAMOTORS", label: "TATAMOTORS • Tata Motors" },
      { value: "MARUTI", label: "MARUTI • Maruti Suzuki" },
      { value: "SUNPHARMA", label: "SUNPHARMA • Sun Pharma" },
      { value: "BAJFINANCE", label: "BAJFINANCE • Bajaj Finance" },
      { value: "TITAN", label: "TITAN • Titan Company" },
      { value: "WIPRO", label: "WIPRO • Wipro Ltd" },
      { value: "TATASTEEL", label: "TATASTEEL • Tata Steel" },
      { value: "POWERGRID", label: "POWERGRID • Power Grid Corp" },
      { value: "NTPC", label: "NTPC • NTPC Ltd" },
      { value: "ULTRACEMCO", label: "ULTRACEMCO • UltraTech Cement" },
      { value: "ADANIENT", label: "ADANIENT • Adani Enterprises" },
      { value: "ADANIPORTS", label: "ADANIPORTS • Adani Ports" },
      { value: "ASIANPAINT", label: "ASIANPAINT • Asian Paints" },
      { value: "HCLTECH", label: "HCLTECH • HCL Technologies" },
      { value: "BAJAJFINSV", label: "BAJAJFINSV • Bajaj Finserv" },
      { value: "NESTLEIND", label: "NESTLEIND • Nestle India" },
      { value: "COALINDIA", label: "COALINDIA • Coal India" },
      { value: "ONGC", label: "ONGC • Oil & Natural Gas" },
      { value: "JSWSTEEL", label: "JSWSTEEL • JSW Steel" },
      { value: "TRENT", label: "TRENT • Trent Ltd" },
      { value: "BEL", label: "BEL • Bharat Electronics" },
      { value: "HAL", label: "HAL • Hindustan Aeronautics" },
      { value: "M&M", label: "M&M • Mahindra & Mahindra" },
      { value: "TECHM", label: "TECHM • Tech Mahindra" },
      { value: "EICHERMOT", label: "EICHERMOT • Eicher Motors" },
      { value: "CIPLA", label: "CIPLA • Cipla Ltd" },
      { value: "DRREDDY", label: "DRREDDY • Dr. Reddy's Lab" },
    ];

    const globalAssets = [
      { value: "SPY", label: "SPY (S&P 500 ETF)" },
      { value: "QQQ", label: "QQQ (Nasdaq 100 ETF)" },
      { value: "AAPL", label: "AAPL (Apple Inc.)" },
      { value: "MSFT", label: "MSFT (Microsoft)" },
      { value: "NVDA", label: "NVDA (NVIDIA)" },
      { value: "TSLA", label: "TSLA (Tesla)" },
      { value: "AMZN", label: "AMZN (Amazon)" },
      { value: "GOOGL", label: "GOOGL (Alphabet)" },
      { value: "META", label: "META (Meta Platforms)" },
    ];

    const primaryValues = new Set([
      ...indianIndices.map((i) => i.value),
      ...topIndianEquities.map((i) => i.value),
      ...globalAssets.map((i) => i.value),
    ]);

    const dynamicOpts = filteredAssets
      .filter((a) => !primaryValues.has(a.symbol))
      .map((a) => ({
        value: a.symbol,
        label: `${a.symbol} • ${a.name}`,
      }));

    return [...indianIndices, ...topIndianEquities, ...globalAssets, ...dynamicOpts];
  }, [filteredAssets]);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!form.name.trim()) e.push("Name is required");
    if (form.entryRules && form.entryRules.length === 0)
      e.push("At least one entry condition is required");
    if (!Number.isInteger(Number(form.params.quantity)) || Number(form.params.quantity) <= 0)
      e.push("Quantity must be a positive integer");
    if (Number(form.params.stopLossPercent ?? form.params.stopLoss) <= 0)
      e.push("Stop loss must be positive");
    if (Number(form.params.targetPercent ?? form.params.targetProfit) <= 0)
      e.push("Target profit must be positive");
    return e;
  }, [form]);

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
              Select NIFTY 50, Bank Nifty, Indian Equities (NSE), or Global Stocks
            </p>
            <div className="ml-7 space-y-3">
              <Select
                searchable
                value={form.instrument}
                onChange={(val) => {
                  const us =
                    [
                      "SPY",
                      "QQQ",
                      "AAPL",
                      "MSFT",
                      "NVDA",
                      "TSLA",
                      "AMZN",
                      "GOOGL",
                      "META",
                    ].includes(val) ||
                    alpacaAssets.some(
                      (a) => a.symbol === val && !["NSE", "BSE"].includes(a.exchange ?? "")
                    );
                  setForm({
                    ...form,
                    instrument: val,
                    params: { ...form.params, market: us ? "US" : "IN" },
                  });
                }}
                options={instrumentOptions}
              />
              <div className="text-[11px] text-slate-400 pt-1">
                Selected: <strong className="text-slate-700">{form.instrument}</strong>
              </div>
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
          <div className="ml-7">
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
        <div className="mt-8 ml-7 space-y-3">
          <h3 className="font-semibold">Optional exit conditions</h3>
          <p className="text-xs text-slate-500">
            Stop loss and target always protect open positions, including while paused or stopped.
          </p>
          <RuleBuilder
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
