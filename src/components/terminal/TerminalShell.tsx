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
  Bell,
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
    <header className="h-14 shrink-0 bg-slate-900 text-white flex items-center justify-between px-6 z-40 border-b border-slate-800">
      <div className="flex items-center gap-8">
        <Link
          href="/terminal"
          className="flex items-center gap-2 font-bold text-[17px] tracking-tight"
        >
          <TrendingUp className="w-5 h-5 text-blue-500" strokeWidth={3} />
          <span>
            Algo<span className="text-slate-300 font-normal">Terminal</span>
          </span>
        </Link>

        <div className="flex items-center gap-5 text-xs font-medium">
          <div className="flex rounded-full bg-slate-800 p-[3px]">
            <button
              onClick={() => t.requestMode("paper")}
              className={`px-4 py-1 rounded-full transition-colors ${t.mode === "paper" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
            >
              PAPER
            </button>
            <button
              onClick={() => t.requestMode("live")}
              className={`px-4 py-1 rounded-full transition-colors ${t.mode === "live" ? "bg-red-500 text-white" : "text-slate-400 hover:text-white"}`}
            >
              LIVE
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4">
          <button className="relative text-slate-300 hover:text-white transition-colors">
            <Bell className="w-4 h-4" />
            <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-rose-500 rounded-full" />
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
      <div className="bg-rose-50 text-rose-600 text-[13px] font-medium px-6 py-2 border-b border-rose-100 flex items-center gap-2">
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
          className="bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-700 shadow-xl flex gap-3"
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
        <nav className="w-[220px] shrink-0 bg-white border-r border-slate-200 flex flex-col py-4 px-3 space-y-1 overflow-y-auto">
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
