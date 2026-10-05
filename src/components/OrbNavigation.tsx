"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function OrbHeader() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-IN", { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-orb-panel border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
          The Algo <span className="text-orb-accent">Trader</span>
        </h1>
        <span className="text-[10px] text-gray-400 tracking-widest uppercase">Open Range Breakout</span>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="font-mono text-gray-300 text-lg mono-nums">{time}</div>
        <div className="flex items-center gap-2 bg-green-900/30 text-green-400 px-3 py-1.5 rounded-full border border-green-800/50">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide uppercase">Strategy Active</span>
        </div>
      </div>
    </header>
  );
}

export function OrbNav() {
  const pathname = usePathname();
  
  const tabs = [
    { name: "Dashboard", href: "/orb/dashboard" },
    { name: "Open Trades", href: "/orb/open-trades" },
    { name: "Opening Ranges", href: "/orb/opening-ranges" },
    { name: "Trade History", href: "/orb/trade-history" },
    { name: "Settings", href: "/orb/settings" },
  ];

  return (
    <nav className="bg-orb-bg border-b border-gray-800 px-6 py-2 flex items-center gap-2 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              isActive 
                ? "bg-blue-900/40 text-blue-400" 
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
