"use client";

import { useState } from "react";
import { useTerminal } from "@/context";
import { Panel, Badge } from "@/components";
import { Key, Shield, Sliders, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const t = useTerminal();
  const [apiKey, setApiKey] = useState("ovioop7ol8h3p4tr");
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Terminal Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure broker connections, paper trading parameters, and execution settings.
        </p>
      </div>

      {/* Broker & API Settings */}
      <Panel title="Broker & Exchange Data Connections">
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Zerodha Kite Connect</div>
                <div className="text-xs text-slate-500">Live Indian market data & execution</div>
              </div>
            </div>
            <Badge tone="green">Active</Badge>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Kite API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm"
            >
              Save API Settings
            </button>
            {saved && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Settings saved successfully
              </span>
            )}
          </div>
        </form>
      </Panel>

      {/* Execution Mode */}
      <Panel title="Trading Engine Configuration">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">Active Trading Mode</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Switch between simulated paper trading and live broker order routing.
              </div>
            </div>
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => t.requestMode("paper")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  t.mode === "paper" ? "bg-white text-blue-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paper Trading
              </button>
              <button
                type="button"
                onClick={() => t.requestMode("live")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  t.mode === "live" ? "bg-red-500 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Live Trading
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
