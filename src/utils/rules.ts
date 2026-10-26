import { INDICATOR_TYPES } from "@/defaults";
import type { Rule } from "@/types";

export type ConditionSource = "stock" | "VIX" | "USDINR";
export const sourceLabels: Record<ConditionSource, string> = {
  stock: "Selected stock",
  VIX: "India VIX",
  USDINR: "USD/INR futures",
};

export function parseIndicatorField(raw: string) {
  const parts = raw.trim().split(/\s*@\s*/);
  const field = parts[0];
  let source: ConditionSource = parts[1] === "VIX" || parts[1] === "USDINR" ? parts[1] : "stock";
  if (field === "VIX" || field === "USDINR") {
    source = field;
    return { type: "Price", period: 0, source };
  }
  const match = field.match(/^(EMA|SMA|RSI)\s*\(?(\d+)?\)?$/i);
  if (match) {
    const type = match[1].toUpperCase();
    return {
      type,
      period: match[2] ? Number(match[2]) : type === "EMA" ? 9 : type === "RSI" ? 14 : 20,
      source,
    };
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(field))
    return { type: "Number", period: Number(field), source };
  const indicator = INDICATOR_TYPES.find(
    (item) => item.value.toLowerCase() === field.toLowerCase()
  );
  return { type: indicator?.value ?? field, period: indicator?.defaultPeriod ?? 0, source };
}

export function formatIndicatorString(
  type: string,
  period: number | string = 0,
  source: ConditionSource = "stock"
) {
  if (type === "Number") return String(period);
  if (type === "Price" && source !== "stock") return source;
  const operand = ["EMA", "SMA", "RSI"].includes(type) ? `${type} ${period}` : type;
  return source === "stock" ? operand : `${operand} @ ${source}`;
}

export function emptyRule(): Rule {
  return { indicator: "EMA 9", operator: "crosses above", value: "EMA 21" };
}

export function describeOperand(raw: string) {
  const parsed = parseIndicatorField(raw);
  if (parsed.type === "Number") return raw;
  const indicator = ["EMA", "SMA", "RSI"].includes(parsed.type)
    ? `${parsed.type} (${parsed.period})`
    : parsed.type === "Price"
      ? "close"
      : parsed.type;
  return `${sourceLabels[parsed.source]} ${indicator}`;
}
