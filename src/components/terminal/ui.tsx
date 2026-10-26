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
      className={`bg-white shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_8px_3px_rgba(60,64,67,0.04)] rounded-2xl ${className}`}
    >
      {title && (
        <div className="px-6 py-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">{title}</h2>
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
    <div className="bg-white shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_8px_3px_rgba(60,64,67,0.04)] rounded-2xl px-5 py-4 flex gap-3.5 items-center">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-slate-100/80 flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div>
        <div className="text-xs font-medium text-slate-500 flex items-center gap-1">{label}</div>
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
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-xs text-slate-400 font-medium">{text}</div>;
}

export const th = "px-5 py-3 font-semibold text-left whitespace-nowrap text-slate-500 text-xs";
export const thr = "px-5 py-3 font-semibold text-right whitespace-nowrap text-slate-500 text-xs";
export const td = "px-5 py-3.5 whitespace-nowrap text-xs text-slate-700";
export const tdr = "px-5 py-3.5 text-right mono-nums whitespace-nowrap text-xs text-slate-700";
export const inputCls =
  "w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-xl px-4 py-2.5 text-sm text-slate-800 transition-all outline-none border-none";
export const btn =
  "px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

import { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

export function Select({
  value,
  onChange,
  options,
  className = "",
  variant = "default",
  size = "default",
  searchable = false,
  placeholder = "Select...",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { label: React.ReactNode; value: string }[];
  className?: string;
  variant?: "default" | "transparent" | "outline";
  size?: "default" | "sm";
  searchable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
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

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 260 && rect.top > 260) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const shouldSearch = searchable || options.length >= 8;

  const filteredOptions =
    shouldSearch && query.trim()
      ? options.filter((o) => {
          const text = typeof o.label === "string" ? o.label : o.value;
          return (
            text.toLowerCase().includes(query.toLowerCase()) ||
            o.value.toLowerCase().includes(query.toLowerCase())
          );
        })
      : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setTimeout(() => {
              const choices = ref.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
              if (choices?.length)
                choices[event.key === "ArrowUp" ? choices.length - 1 : 0].focus();
            }, 0);
          }
        }}
        className={`disabled:cursor-not-allowed disabled:opacity-50 w-full flex items-center justify-between cursor-pointer transition-all ${
          variant === "transparent"
            ? "bg-transparent text-[13px] font-bold text-slate-900 hover:text-blue-600"
            : size === "sm"
              ? "bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs"
              : "bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 shadow-2xs"
        }`}
        onClick={() => {
          setOpen(!open);
          if (!open) setQuery("");
        }}
      >
        <span className="truncate">{selected ? selected.label : value || placeholder}</span>
        <ChevronDown
          className={`shrink-0 ml-2 transition-transform duration-200 ${open ? "rotate-180" : ""} ${
            variant === "outline" || variant === "default"
              ? size === "sm"
                ? "w-3.5 h-3.5 text-slate-500"
                : "w-4 h-4 text-slate-500"
              : "w-3.5 h-3.5 text-slate-600"
          }`}
        />
      </button>
      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              ref.current?.querySelector("button")?.focus();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const choices = Array.from(
                ref.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
              );
              const index = choices.indexOf(document.activeElement as HTMLButtonElement);
              choices[
                (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length
              ]?.focus();
            }
          }}
          className={`absolute z-[9999] ${
            openUpward ? "bottom-full mb-2" : "top-full mt-2"
          } bg-white rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.14)] p-1.5 border border-slate-200 max-h-60 overflow-y-auto custom-scrollbar ${
            variant === "transparent" ? "min-w-[220px] left-0" : "w-full min-w-[180px] left-0"
          }`}
        >
          {shouldSearch && (
            <div className="p-1.5 pb-2 sticky top-0 bg-white z-10 border-b border-slate-100 mb-1">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 border-none"
                />
              </div>
            </div>
          )}
          {filteredOptions.length > 100 && (
            <p className="px-3 py-2 text-[11px] text-slate-500">
              {filteredOptions.length} matches · Type to narrow the list. Showing first 100.
            </p>
          )}
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center">No options found</div>
          ) : (
            filteredOptions.slice(0, 100).map((opt) => (
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                key={opt.value}
                className={`w-full text-left focus:bg-slate-100 focus:outline-none ${
                  size === "sm" ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-xs"
                } cursor-pointer rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-between gap-2 ${
                  opt.value === value
                    ? "bg-blue-50 text-blue-600 font-bold"
                    : "text-slate-700 font-medium"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  ref.current?.querySelector("button")?.focus();
                }}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function MultiSelect({
  values,
  onChange,
  options,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const filtered = options.filter((o) =>
    `${o.value} ${o.label}`.toLowerCase().includes(query.toLowerCase())
  );
  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label="Select strategy instruments"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium shadow-2xs"
      >
        <span className="truncate">
          {values.length
            ? `${values.length} selected · ${values.slice(0, 3).join(", ")}${values.length > 3 ? "…" : ""}`
            : "Select stocks or indices"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <input
            autoFocus
            aria-label="Search Indian stocks"
            placeholder="Search stocks or company names…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-blue-500"
          />
          <p className="px-2 pb-2 text-xs text-slate-500">
            {values.length}/100 selected · {filtered.length} matches
            {filtered.length > 100 ? " · Showing first 100" : ""}
          </p>
          <div className="max-h-60 overflow-y-auto">
            {filtered.slice(0, 100).map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-xs hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={values.includes(o.value)}
                  disabled={!values.includes(o.value) && values.length >= 100}
                  onChange={() => toggle(o.value)}
                  className="accent-blue-600"
                />
                <span>{o.label}</span>
              </label>
            ))}
            {!filtered.length && <p className="p-3 text-xs text-slate-500">No matching stocks</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Done
          </button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Remove ${value}`}
            onClick={() => toggle(value)}
            className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
          >
            {value} ×
          </button>
        ))}
      </div>
    </div>
  );
}
