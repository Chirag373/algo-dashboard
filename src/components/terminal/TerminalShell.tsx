"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Octagon,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { TerminalProvider, useTerminal } from "@/lib/terminal/store";
import { pnlColor, signed } from "@/lib/terminal/format";

const NAV = [
  { href: "/terminal", label: "Overview", icon: LayoutDashboard },
  { href: "/terminal/trading", label: "Trading", icon: Activity },
  { href: "/terminal/strategies", label: "Strategies", icon: ListChecks },
  { href: "/terminal/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/terminal/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/terminal/risk", label: "Risk", icon: ShieldAlert },
];

function CommandBar() {
  const t = useTerminal();
  const [confirmKill, setConfirmKill] = useState(false);
  const running = t.strategies.filter((s) => s.status === "running").length;

  return (
    <header className="h-14 shrink-0 border-b border-slate-800 bg-[#0a0e17] flex items-center gap-4 px-4 sticky top-0 z-40">
      <div className="flex items-center gap-2 font-bold tracking-wide text-white">
        <Zap className="w-5 h-5 text-blue-500" />
        <span className="hidden sm:inline">Algo Terminal</span>
      </div>

      <div
        role="group"
        aria-label="Trading mode"
        className="flex rounded-md border border-slate-700 overflow-hidden text-xs font-bold"
      >
        <button
          onClick={() => t.requestMode("paper")}
          aria-pressed={t.mode === "paper"}
          className={`px-3 py-1.5 ${t.mode === "paper" ? "bg-amber-500 text-black" : "text-slate-400 hover:bg-slate-800"}`}
        >
          PAPER
        </button>
        <button
          onClick={() => t.requestMode("live")}
          aria-pressed={t.mode === "live"}
          title={t.liveEnabled ? "Switch to live trading" : "Live trading is disabled"}
          className={`px-3 py-1.5 ${t.mode === "live" ? "bg-red-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}
        >
          LIVE
        </button>
      </div>

      <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
        {t.feedConnected ? (
          <Wifi className="w-4 h-4 text-emerald-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-rose-400" />
        )}
        <span>
          {t.connection === "online"
            ? `Feed: ${t.feedKind} · ${t.marketOpen ? "market open" : "market closed"}`
            : t.connection === "connecting"
              ? "Connecting..."
              : "Backend offline"}
        </span>
        <span className="mx-2 text-slate-700">|</span>
        <span>{running} running</span>
        <span className="mx-2 text-slate-700">|</span>
        <span className="mono-nums">{t.now} IST</span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="text-right leading-tight">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Day P&amp;L</div>
          <div className={`mono-nums font-bold text-sm ${pnlColor(t.dayPnl)}`}>
            {signed(t.dayPnl)}
          </div>
        </div>

        {t.killed ? (
          <button
            onClick={t.toggleKill}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold"
          >
            <Octagon className="w-4 h-4" /> RELEASE KILL
          </button>
        ) : (
          <button
            onClick={() => setConfirmKill(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
          >
            <Octagon className="w-4 h-4" /> KILL
          </button>
        )}
      </div>

      {confirmKill && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm kill switch"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-red-900 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold text-white">Engage kill switch?</h3>
            <p className="text-sm text-slate-400">
              This blocks all new orders and stops strategies from entering trades. You can also
              close every open position now.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setConfirmKill(false);
                  await t.squareOffAll();
                  await t.engageKill();
                }}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-md"
              >
                Kill + square off all
              </button>
              <button
                onClick={async () => {
                  setConfirmKill(false);
                  await t.engageKill();
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-md"
              >
                Kill only (keep positions)
              </button>
              <button
                onClick={() => setConfirmKill(false)}
                className="text-slate-400 hover:text-white py-1 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Banner() {
  const t = useTerminal();
  if (t.connection !== "online") {
    return (
      <div
        role="alert"
        className="bg-red-950 text-red-200 text-xs font-semibold px-4 py-1.5 border-b border-red-900"
      >
        {t.connection === "connecting"
          ? "Connecting to the backend..."
          : "BACKEND OFFLINE: data is stale and commands will fail. Reconnecting automatically. Start it with: uvicorn app.main:app --port 8001"}
      </div>
    );
  }
  if (t.killed) {
    return (
      <div className="bg-red-950 text-red-200 text-xs font-semibold px-4 py-1.5 border-b border-red-900">
        KILL SWITCH ENGAGED: new orders are blocked and strategies cannot enter.
        {t.lossLimitHit && " (Triggered by max daily loss)"}
      </div>
    );
  }
  if (t.mode === "paper") {
    return (
      <div className="bg-amber-950/60 text-amber-300 text-xs px-4 py-1 border-b border-amber-900/50">
        PAPER MODE: simulated fills, no real money at risk.
      </div>
    );
  }
  return null;
}

function Toasts() {
  const t = useTerminal();
  const recent = t.alerts.slice(0, 3);
  if (recent.length === 0) return null;
  const color = {
    info: "border-blue-700 bg-blue-950",
    warn: "border-amber-700 bg-amber-950",
    critical: "border-red-700 bg-red-950",
  } as const;
  return (
    <div className="fixed bottom-4 right-4 z-40 space-y-2 w-80" aria-live="polite">
      {recent.map((a) => (
        <div
          key={a.id}
          className={`border rounded-lg px-3 py-2 text-xs text-slate-100 flex gap-2 shadow-lg ${color[a.level]}`}
        >
          <span className="flex-1">
            <span className="mono-nums text-slate-400 mr-2">{a.time}</span>
            {a.message}
          </span>
          <button onClick={() => t.dismissAlert(a.id)} aria-label="Dismiss alert">
            <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="h-screen flex flex-col bg-[#05080f] text-slate-200">
      <CommandBar />
      <Banner />
      <div className="flex flex-1 min-h-0">
        <nav className="w-14 md:w-52 shrink-0 border-r border-slate-800 bg-[#0a0e17] py-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/terminal" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-l-2 ${
                  active
                    ? "border-blue-500 bg-slate-800/60 text-white"
                    : "border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 min-w-0 overflow-auto p-4 md:p-6">{children}</main>
      </div>
      <Toasts />
    </div>
  );
}

export default function TerminalShell({ children }: { children: React.ReactNode }) {
  return (
    <TerminalProvider>
      <Shell>{children}</Shell>
    </TerminalProvider>
  );
}
