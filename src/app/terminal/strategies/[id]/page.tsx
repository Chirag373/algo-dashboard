"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, X, Search, Sparkles, ArrowLeft } from "lucide-react";
import { useTerminal } from "@/lib/terminal/store";
import { Empty, Panel, Select, inputCls } from "@/components/terminal";
import type { ParamValue, Rule, Strategy } from "@/lib/terminal/types";

const STANDARD_TIMEFRAMES = [
  { value: "1m", label: "1m (1 Minute)" },
  { value: "5m", label: "5m (5 Minutes)" },
  { value: "15m", label: "15m (15 Minutes)" },
  { value: "30m", label: "30m (30 Minutes)" },
  { value: "1h", label: "1h (1 Hour)" },
  { value: "4h", label: "4h (4 Hours)" },
  { value: "custom", label: "Custom Timeframe..." },
];

const OPERATORS_LIST = [
  "crosses above",
  "crosses below",
  "greater than",
  "less than",
  "is above",
  "is below",
  "equals",
];

const INDICATOR_TYPES = [
  { value: "EMA", label: "EMA", hasPeriod: true, defaultPeriod: 9 },
  { value: "SMA", label: "SMA", hasPeriod: true, defaultPeriod: 20 },
  { value: "RSI", label: "RSI", hasPeriod: true, defaultPeriod: 14 },
  { value: "Price", label: "Price (Close)", hasPeriod: false },
  { value: "Opening Range High", label: "Opening Range High", hasPeriod: false },
  { value: "Opening Range Low", label: "Opening Range Low", hasPeriod: false },
  { value: "VWAP", label: "VWAP", hasPeriod: false },
  { value: "Supertrend", label: "Supertrend", hasPeriod: false },
  { value: "Number", label: "Fixed Number / Value", hasPeriod: false, isNumber: true },
];

// Helper to parse indicator string into { type, period }
function parseIndicatorField(raw: string) {
  if (!raw) return { type: "EMA", period: 9 };
  const str = raw.trim();
  const match = str.match(/^(EMA|SMA|RSI)\s*\(?(\d+)?\)?$/i);
  if (match) {
    return {
      type: match[1].toUpperCase(),
      period: match[2] ? Number(match[2]) : match[1].toUpperCase() === "EMA" ? 9 : 20,
    };
  }
  // Check if it's purely a number
  if (/^\d+(\.\d+)?$/.test(str)) {
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
    return `${type} ${period ?? (type === "EMA" ? 9 : 20)}`;
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
                <span className="text-xs font-bold text-slate-500 w-9 text-center">
                  {i === 0 ? "IF" : "AND"}
                </span>

                {/* Left Side: Indicator Selection */}
                <div className="flex items-center gap-1.5">
                  <Select
                    className="w-[140px]"
                    value={leftParsed.type}
                    onChange={(val) => {
                      const def = INDICATOR_TYPES.find((t) => t.value === val)?.defaultPeriod ?? leftParsed.period;
                      const newInd = formatIndicatorString(val, def);
                      onChange(
                        rules.map((x, j) => (j === i ? { ...x, indicator: newInd } : x))
                      );
                    }}
                    options={INDICATOR_TYPES.map((o) => ({ value: o.value, label: o.label }))}
                  />

                  {/* Left Side: Number/Period Input beside indicator if applicable */}
                  {["EMA", "SMA", "RSI", "Number"].includes(leftParsed.type) && (
                    <div className="relative w-16">
                      <input
                        type="number"
                        min="1"
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500 text-center shadow-sm"
                        placeholder={leftParsed.type === "EMA" ? "9" : "20"}
                        value={leftParsed.period || ""}
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
                      const def = INDICATOR_TYPES.find((t) => t.value === val)?.defaultPeriod ?? (val === "EMA" ? 21 : 20);
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
                        min="1"
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500 text-center shadow-sm"
                        placeholder={rightParsed.type === "EMA" ? "21" : "20"}
                        value={rightParsed.period || ""}
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
        exitRules: [{ indicator: "EMA 21", operator: "crosses below", value: "EMA 9" }],
      }
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Alpaca assets state
  const [alpacaAssets, setAlpacaAssets] = useState<{ symbol: string; name: string }[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Custom timeframe state
  const [customTf, setCustomTf] = useState("");
  const isCustomTimeframe = !["1m", "5m", "15m", "30m", "1h", "4h"].includes(form.timeframe);

  // Load Alpaca assets on mount
  useEffect(() => {
    let active = true;
    async function loadAssets() {
      setLoadingAssets(true);
      try {
        const res = await fetch("http://localhost:8001/api/v1/assets?limit=250");
        if (res.ok) {
          const data = await res.json();
          if (active && data.assets) {
            setAlpacaAssets(data.assets);
          }
        }
      } catch (err) {
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

  // Filter or search Alpaca assets dynamically
  const filteredAssets = useMemo(() => {
    if (!assetSearch.trim()) return alpacaAssets;
    const q = assetSearch.toLowerCase();
    return alpacaAssets.filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [alpacaAssets, assetSearch]);

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
        timeframe: isCustomTimeframe ? (customTf.trim() || form.timeframe) : form.timeframe,
        params: {
          ...form.params,
          quantity: Number(form.params.quantity || 100),
          stopLossPercent: Number(form.params.stopLoss || form.params.stopLossPercent || 1),
          targetPercent: Number(form.params.targetProfit || form.params.targetPercent || 2),
          perTradeAmount: Math.max(100, Number(form.params.quantity || 100) * 100),
          squareOffTime: (form.params.squareOffTime as string) || "15:15",
        },
        entryRules: form.entryRules && form.entryRules.length > 0 ? form.entryRules : [emptyRule()],
        exitRules:
          form.exitRules && form.exitRules.length > 0
            ? form.exitRules
            : [{ indicator: "EMA 21", operator: "crosses below", value: "EMA 9" }],
      };
      const res = await t.saveStrategy(payload, isNew);
      if (res.ok) {
        router.push("/terminal/strategies");
      } else {
        setServerError(res.message);
      }
    } catch (err: any) {
      setServerError(err.message || "Failed to save strategy");
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
                onChange={(val) => setForm({ ...form, instrument: val })}
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
                  if (val === "custom") {
                    setCustomTf(form.timeframe || "10m");
                    setForm({ ...form, timeframe: form.timeframe || "10m" });
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
            Visual condition builder (Example: EMA 9 crosses above EMA 21)
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

      {((touched && errors.length > 0) || serverError) && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-sm font-medium border border-rose-200">
          <ul className="list-disc pl-5 space-y-1">
            {touched && errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
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
          {saving ? "Saving..." : isNew ? "Create Strategy" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
