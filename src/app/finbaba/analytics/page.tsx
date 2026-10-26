"use client";

import { useState } from "react";
import { Select } from "@/components/terminal/ui";
import { Download } from "lucide-react";

export default function FinbabaAnalytics() {
  const [strategy, setStrategy] = useState("All Strategies");
  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">
      {/* Filter Panel */}
      <div className="bg-fin-panel border border-gray-800 rounded-lg p-4 flex flex-wrap items-center justify-between shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            aria-label="Strategy"
            value={strategy}
            onChange={setStrategy}
            className="min-w-52"
            options={[
              "All Strategies",
              ...[1, 2, 3, 4, 5].map((i) => `C${i} — Nifty`),
              ...[1, 2, 3, 4, 5].map((i) => `B${i} — BankNifty`),
            ].map((value) => ({ value, label: value }))}
          />
          <input
            type="date"
            className="bg-[#1a1a1a] text-gray-200 px-3 py-2 rounded border border-gray-700 outline-none focus:border-green-500 text-sm"
          />
          <input
            type="date"
            className="bg-[#1a1a1a] text-gray-200 px-3 py-2 rounded border border-gray-700 outline-none focus:border-green-500 text-sm"
          />
          <button className="border border-green-500 text-green-500 hover:bg-green-500/10 px-6 py-2 rounded font-medium text-sm transition-colors">
            Apply Filter
          </button>
          <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded font-medium text-sm transition-colors">
            Reset
          </button>
        </div>
        <button className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded transition-colors text-sm font-medium">
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: "Total Trades", value: "142", color: "text-white" },
          { label: "Wins", value: "95", color: "text-green-500" },
          { label: "Losses", value: "47", color: "text-red-500" },
          { label: "Win Rate", value: "66.90%", color: "text-white" },
          { label: "Index P&L", value: "+450.25", color: "text-green-500" },
          { label: "ACC1 Total", value: "+₹22,512.50", color: "text-green-500" },
          { label: "ACC2 Total", value: "+₹22,512.50", color: "text-green-500" },
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-fin-panel border border-gray-800 rounded-lg p-4 flex flex-col justify-center shadow-sm"
          >
            <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-2">
              {stat.label}
            </span>
            <span className={`text-xl font-bold mono-nums ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Analytics Table */}
      <div className="bg-fin-panel border border-gray-800 rounded-lg overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#151515] text-gray-400 uppercase tracking-wider border-b border-gray-800">
              <tr>
                <th className="px-3 py-3 font-medium">Strategy</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Candle</th>
                <th className="px-3 py-3 font-medium">Exact Entry</th>
                <th className="px-3 py-3 font-medium text-right">Entry Price</th>
                <th className="px-3 py-3 font-medium text-right">BEES Entry</th>
                <th className="px-3 py-3 font-medium text-right">ISL</th>
                <th className="px-3 py-3 font-medium text-right">CSL</th>
                <th className="px-3 py-3 font-medium text-center">Level</th>
                <th className="px-3 py-3 font-medium text-right">Exit Price</th>
                <th className="px-3 py-3 font-medium text-right">BEES Exit</th>
                <th className="px-3 py-3 font-medium text-right">Exit Time</th>
                <th className="px-3 py-3 font-medium text-right">Index P&L</th>
                <th className="px-3 py-3 font-medium text-right">ACC1 P&L</th>
                <th className="px-3 py-3 font-medium text-right">ACC2 P&L</th>
                <th className="px-3 py-3 font-medium text-right">Prev Close</th>
                <th className="px-3 py-3 font-medium text-center">Bull/Bear</th>
                <th className="px-3 py-3 font-medium text-right">D.EMA50</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              <tr className="hover:bg-fin-panel-hover transition-colors group">
                <td className="px-3 py-2">
                  <span className="bg-blue-900/50 text-blue-300 font-bold px-1.5 py-0.5 rounded">
                    C2
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-300 mono-nums">2023-10-27</td>
                <td className="px-3 py-2 text-gray-300 mono-nums">09:15</td>
                <td className="px-3 py-2 text-gray-300 mono-nums">19500.00</td>
                <td className="px-3 py-2 text-right mono-nums">19510.50</td>
                <td className="px-3 py-2 text-right mono-nums">195.10</td>
                <td className="px-3 py-2 text-right mono-nums text-gray-500">19450.00</td>
                <td className="px-3 py-2 text-right mono-nums text-amber-500 font-bold bg-amber-900/10">
                  19480.00
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="bg-amber-500/20 text-amber-500 font-bold px-1.5 py-0.5 rounded">
                    L2
                  </span>
                </td>
                <td className="px-3 py-2 text-right mono-nums">19550.00</td>
                <td className="px-3 py-2 text-right mono-nums">195.50</td>
                <td className="px-3 py-2 text-right mono-nums text-gray-400">10:45</td>
                <td className="px-3 py-2 text-right mono-nums font-medium text-green-500">
                  +39.50
                </td>
                <td className="px-3 py-2 text-right mono-nums font-medium text-green-500">
                  +₹1,975
                </td>
                <td className="px-3 py-2 text-right mono-nums font-medium text-green-500">
                  +₹1,975
                </td>
                <td className="px-3 py-2 text-right mono-nums text-gray-500">19420.00</td>
                <td className="px-3 py-2 text-center">
                  <span className="text-green-500 font-bold">BULL</span>
                </td>
                <td className="px-3 py-2 text-right mono-nums text-gray-500">19350.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
