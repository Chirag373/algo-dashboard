"use client";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-[#0d1220] border border-slate-800 rounded-lg ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 tracking-wide">{title}</h2>
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
  tone = "text-white",
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#0d1220] border border-slate-800 rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className={`mono-nums text-xl font-bold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
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
    slate: "bg-slate-800 text-slate-300",
    green: "bg-emerald-900/50 text-emerald-300",
    red: "bg-rose-900/50 text-rose-300",
    amber: "bg-amber-900/50 text-amber-300",
    blue: "bg-blue-900/50 text-blue-300",
    purple: "bg-purple-900/50 text-purple-300",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{text}</div>;
}

export const th = "px-4 py-2.5 font-medium text-left whitespace-nowrap";
export const thr = "px-4 py-2.5 font-medium text-right whitespace-nowrap";
export const td = "px-4 py-2.5 whitespace-nowrap";
export const tdr = "px-4 py-2.5 text-right mono-nums whitespace-nowrap";
export const inputCls =
  "w-full bg-[#05080f] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500";
export const btn =
  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
