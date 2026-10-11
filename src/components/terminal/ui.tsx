"use client";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white border border-slate-100 shadow-sm rounded-xl overflow-hidden ${className}`}
    >
      {title && (
        <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-slate-800 flex items-center gap-2">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "text-slate-800",
  sub,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-100 shadow-sm rounded-xl px-4 py-3 flex gap-3 items-center">
      {icon && (
        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div>
        <div className="text-[13px] font-medium text-slate-500 flex items-center gap-1">
          {label}
        </div>
        <div className={`mono-nums text-lg font-bold leading-tight ${tone}`}>{value}</div>
        {sub && <div className="text-[11px] font-medium">{sub}</div>}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue" | "purple";
}) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-xs text-slate-400 font-medium">{text}</div>;
}

export const th = "px-4 py-2 font-medium text-left whitespace-nowrap text-slate-500 text-[11px]";
export const thr = "px-4 py-2 font-medium text-right whitespace-nowrap text-slate-500 text-[11px]";
export const td = "px-4 py-2 whitespace-nowrap text-xs text-slate-700";
export const tdr = "px-4 py-2 text-right mono-nums whitespace-nowrap text-xs text-slate-700";
export const inputCls =
  "w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500";
export const btn =
  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export function Select({
  value,
  onChange,
  options,
  className = "",
  variant = "default",
  size = "default",
}: {
  value: string;
  onChange: (val: string) => void;
  options: { label: React.ReactNode; value: string }[];
  className?: string;
  variant?: "default" | "transparent";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        className={`w-full flex items-center justify-between cursor-pointer ${
          variant === "default"
            ? size === "sm"
              ? "bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-blue-500 hover:border-slate-300"
              : "bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 hover:border-slate-300"
            : "bg-transparent text-[13px] font-bold text-slate-900"
        }`}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{selected ? selected.label : value}</span>
        <ChevronDown
          className={`shrink-0 ml-2 ${
            variant === "default"
              ? size === "sm"
                ? "w-3 h-3 text-slate-400"
                : "w-4 h-4 text-slate-400"
              : "w-3.5 h-3.5 text-slate-600"
          }`}
        />
      </div>
      {open && (
        <div
          className={`absolute z-[99] mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto ${
            variant === "transparent" ? "min-w-[120px] left-0" : ""
          }`}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`${
                size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
              } cursor-pointer hover:bg-slate-50 transition-colors ${
                opt.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"
              }`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
