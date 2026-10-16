"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  ShieldAlert,
  Settings,
  WifiOff,
  X,
  TrendingUp,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TerminalProvider, useTerminal } from "@/lib/terminal/store";

const NAV = [
  { href: "/terminal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/terminal/trading", label: "Trading", icon: Activity },
  { href: "/terminal/strategies", label: "Strategies", icon: ListChecks },
  { href: "/terminal/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/terminal/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/terminal/risk", label: "Risk", icon: ShieldAlert },
  { href: "/terminal/settings", label: "Settings", icon: Settings },
];

function CommandBar() {
  const t = useTerminal();

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-100 flex items-center px-6 z-30">
      <div className="flex items-center gap-5">
        <Link
          href="/terminal"
          className="flex items-center gap-2.5 font-bold text-base text-slate-900 tracking-tight"
        >
          <TrendingUp className="w-5 h-5 text-blue-600" strokeWidth={2.5} />
          <span>AlgoTerminal</span>
        </Link>

        {/* Paper / Live segmented pill container */}
        <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-full p-1 gap-1 shadow-2xs">
          <button
            type="button"
            onClick={() => t.requestMode("paper")}
            className={`px-4 py-1.5 min-w-[68px] text-center rounded-full text-xs font-semibold transition-all ${
              t.mode === "paper"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Paper
          </button>
          <button
            type="button"
            onClick={() => t.requestMode("live")}
            className={`px-4 py-1.5 min-w-[68px] text-center rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              t.mode === "live"
                ? "bg-rose-500 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.mode === "live" && (
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            )}
            Live
          </button>
        </div>
      </div>
    </header>
  );
}

function Banner() {
  const t = useTerminal();
  if (t.connection !== "online") {
    return (
      <div className="bg-rose-50 text-rose-600 text-[13px] font-medium px-6 py-2.5 flex items-center gap-2">
        <WifiOff className="w-4 h-4" />
        {t.connection === "connecting"
          ? "Connecting to backend..."
          : "Backend offline. Reconnecting automatically."}
      </div>
    );
  }
  return null;
}

const TOAST_MS = 5000;
const NOISE = /^New trading day/;

function Toasts() {
  const t = useTerminal();
  const seen = useRef<Set<string> | null>(null);
  const [visible, setVisible] = useState<typeof t.alerts>([]);

  useEffect(() => {
    // Seed with the existing backlog once connected so old alerts never pop up on load.
    if (seen.current === null) {
      if (t.connection !== "online") return;
      seen.current = new Set(t.alerts.map((a) => a.id));
      return;
    }
    const fresh = t.alerts.filter((a) => !seen.current!.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => seen.current!.add(a.id));
    const show = fresh.filter((a) => !NOISE.test(a.message));
    if (show.length === 0) return;
    setVisible((v) => [...show, ...v].slice(0, 3));
    show.forEach((a) =>
      setTimeout(() => setVisible((v) => v.filter((x) => x.id !== a.id)), TOAST_MS)
    );
  }, [t.alerts, t.connection]);

  const dismiss = (id: string) => {
    setVisible((v) => v.filter((x) => x.id !== id));
    t.dismissAlert(id);
  };

  if (visible.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3 w-80">
      {visible.map((a) => (
        <div
          key={a.id}
          className="bg-white rounded-2xl p-4 text-xs text-slate-700 shadow-[0_10px_40px_rgba(0,0,0,0.12)] border-none flex gap-3.5"
        >
          <span className="flex-1">
            <span className="font-semibold text-slate-900 block mb-0.5">
              {a.level.toUpperCase()}
            </span>
            {a.message}
          </span>
          <button onClick={() => dismiss(a.id)}>
            <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <CommandBar />
      <Banner />
      <div className="flex flex-1 min-h-0">
        <nav className="w-[220px] shrink-0 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.03)] flex flex-col py-4 px-3 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/terminal" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 overflow-y-auto overflow-x-auto min-h-0 p-4 md:p-6 flex flex-col">
          {children}
        </main>
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
