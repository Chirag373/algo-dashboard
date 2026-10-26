"use client";

import { Plus, X } from "lucide-react";
import { INDICATOR_TYPES, OPERATORS_LIST } from "@/defaults";
import type { Rule } from "@/types";
import {
  describeOperand,
  emptyRule,
  formatIndicatorString,
  parseIndicatorField,
  sourceLabels,
  type ConditionSource,
} from "@/utils/rules";
import { Empty, Select } from "./ui";

const indicators = INDICATOR_TYPES.filter((item) => !["VIX", "USDINR"].includes(item.value));
const numericClass =
  "w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-blue-500";

export function RuleBuilder({
  rules,
  onChange,
  purpose = "entry",
}: {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  purpose?: "entry" | "exit";
}) {
  const update = (index: number, patch: Partial<Rule>) =>
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  return (
    <div className="space-y-4">
      {!rules.length ? (
        <Empty text="No conditions. Add a condition to continue." />
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => {
            const left = parseIndicatorField(rule.indicator);
            const right = parseIndicatorField(rule.value);
            const thresholdOnly =
              left.type === "RSI" || (left.source !== "stock" && left.type === "Price");
            const sourceName = sourceLabels[left.source];
            return (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  {index === 0 ? (
                    <span className="w-9 text-center text-xs font-bold text-slate-500">IF</span>
                  ) : (
                    <Select
                      aria-label={`Condition ${index + 1} connector`}
                      className="w-24"
                      value={rule.connector ?? "AND"}
                      onChange={(connector) =>
                        update(index, { connector: connector as "AND" | "OR" })
                      }
                      options={[
                        { value: "AND", label: "AND" },
                        { value: "OR", label: "OR" },
                      ]}
                    />
                  )}
                  <label className="grid gap-1 text-[11px] text-slate-500">
                    Data source
                    <Select
                      aria-label={`Condition ${index + 1} data source`}
                      className="w-48"
                      value={left.source}
                      onChange={(value) => {
                        const source = value as ConditionSource;
                        if (source !== "stock")
                          update(index, {
                            indicator: formatIndicatorString("RSI", 14, source),
                            operator: "crosses below",
                            value: "30",
                          });
                        else
                          update(index, {
                            indicator: formatIndicatorString(left.type, left.period, source),
                            value:
                              right.type === "Number"
                                ? rule.value
                                : formatIndicatorString(right.type, right.period, source),
                          });
                      }}
                      options={Object.entries(sourceLabels).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </label>
                  <label className="grid gap-1 text-[11px] text-slate-500">
                    Indicator
                    <Select
                      aria-label={`Condition ${index + 1} indicator`}
                      className="w-48"
                      value={left.type}
                      onChange={(type) => {
                        const period =
                          INDICATOR_TYPES.find((item) => item.value === type)?.defaultPeriod ?? 0;
                        const patch: Partial<Rule> = {
                          indicator: formatIndicatorString(type, period, left.source),
                        };
                        if (type === "RSI")
                          Object.assign(patch, { value: "30", operator: "crosses below" });
                        else if (type === "Price" && left.source !== "stock")
                          patch.value = left.source === "VIX" ? "15" : "90";
                        else if (type === "EMA" || type === "SMA")
                          patch.value = formatIndicatorString(
                            type,
                            type === "EMA" ? 21 : 50,
                            left.source
                          );
                        update(index, patch);
                      }}
                      options={indicators
                        .filter((item) => left.source === "stock" || item.value !== "Number")
                        .map((item) => ({
                          value: item.value,
                          label:
                            item.value === "Price" && left.source !== "stock"
                              ? `${sourceName} value`
                              : item.label,
                        }))}
                    />
                  </label>
                  {left.type === "RSI" && (
                    <span className="text-xs text-slate-500">{left.period} candles</span>
                  )}
                  {["EMA", "SMA", "Number"].includes(left.type) && (
                    <label className="grid gap-1 text-[11px] text-slate-500">
                      {left.type === "Number" ? "Value" : "Period"}
                      <input
                        type="number"
                        aria-label={`Condition ${index + 1} left period or value`}
                        className={numericClass}
                        value={left.period}
                        min={left.type === "Number" ? undefined : 1}
                        max={left.type === "Number" ? undefined : 500}
                        step={left.type === "Number" ? "any" : 1}
                        onChange={(e) =>
                          update(index, {
                            indicator: formatIndicatorString(
                              left.type,
                              e.target.value,
                              left.source
                            ),
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="grid gap-1 text-[11px] text-slate-500">
                    Comparison
                    <Select
                      aria-label={`Condition ${index + 1} comparison`}
                      className="w-48"
                      value={rule.operator}
                      onChange={(operator) => update(index, { operator })}
                      options={OPERATORS_LIST.map((value) => ({ value, label: value }))}
                    />
                  </label>
                  {thresholdOnly ? (
                    <label className="grid gap-1 text-[11px] text-slate-500">
                      {left.type === "RSI" ? "RSI level" : `${sourceName} level`}
                      <input
                        aria-label={`Condition ${index + 1} threshold`}
                        type="number"
                        min={0}
                        max={left.type === "RSI" ? 100 : undefined}
                        step="any"
                        className={numericClass}
                        value={right.type === "Number" ? rule.value : ""}
                        onChange={(e) => update(index, { value: e.target.value })}
                      />
                    </label>
                  ) : (
                    <>
                      <label className="grid gap-1 text-[11px] text-slate-500">
                        Compare with
                        <Select
                          aria-label={`Condition ${index + 1} right indicator`}
                          className="w-48"
                          value={right.type}
                          onChange={(type) => {
                            const period =
                              INDICATOR_TYPES.find((item) => item.value === type)?.defaultPeriod ??
                              0;
                            update(index, {
                              value: formatIndicatorString(type, period, left.source),
                            });
                          }}
                          options={indicators.map((item) => ({
                            value: item.value,
                            label: item.label,
                          }))}
                        />
                      </label>
                      {["EMA", "SMA", "RSI", "Number"].includes(right.type) && (
                        <label className="grid gap-1 text-[11px] text-slate-500">
                          {right.type === "Number" ? "Value" : "Period"}
                          <input
                            type="number"
                            aria-label={`Condition ${index + 1} right period or value`}
                            className={numericClass}
                            value={right.period}
                            min={right.type === "Number" ? undefined : 1}
                            max={right.type === "Number" ? undefined : 500}
                            step={right.type === "Number" ? "any" : 1}
                            onChange={(e) =>
                              update(index, {
                                value: formatIndicatorString(
                                  right.type,
                                  e.target.value,
                                  right.source
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove condition ${index + 1}`}
                    onClick={() => onChange(rules.filter((_, i) => i !== index))}
                    className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  {describeOperand(rule.indicator)} {rule.operator} {describeOperand(rule.value)}.
                </p>
                {left.source !== "stock" && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {left.type === "RSI"
                      ? `RSI is calculated from ${sourceName} candles, not the selected stocks.`
                      : `Both indicator operands use ${sourceName} unless a different source is already saved.`}{" "}
                    {purpose === "entry"
                      ? "This condition is checked before buying the selected stocks."
                      : "This condition is checked before closing the strategy’s positions."}
                    {left.source === "USDINR" && " Uses the strategy’s saved futures contract."}
                  </p>
                )}
                {left.source === "VIX" && left.type === "VWAP" && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    VIX is an index and may have no trading volume. VWAP waits when volume is
                    unavailable.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {rules.length > 1 && (
        <p className="text-xs text-slate-500">
          AND requires both conditions. OR allows either condition. AND is evaluated before OR.
        </p>
      )}
      <button
        type="button"
        onClick={() => onChange([...rules, { ...emptyRule(), connector: "AND" }])}
        className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
      >
        <Plus className="h-3.5 w-3.5" /> Add Condition
      </button>
    </div>
  );
}
