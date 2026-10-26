"use client";

import { Select } from "@/components/terminal/ui";
import { useState } from "react";
import { Search, FileText } from "lucide-react";
import { TradeLogsModal } from "@/components/TradeLogsModal";

export default function TradeHistory() {
  const [tradeType, setTradeType] = useState("All Types");
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-orb-panel p-4 rounded-xl border border-gray-800 shadow-sm">
        <input
          type="date"
          className="bg-white text-black px-3 py-2 rounded border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          className="bg-white text-black px-3 py-2 rounded border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Symbol..."
          className="bg-white text-black px-3 py-2 rounded border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Select
          aria-label="Trade type"
          value={tradeType}
          onChange={setTradeType}
          className="min-w-36"
          options={["All Types", "LONG", "SHORT"].map((value) => ({ value, label: value }))}
        />
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded flex items-center gap-2 transition-colors font-medium">
          <Search className="w-4 h-4" />
          Search
        </button>
      </div>

      {/* Table */}
      <div className="bg-orb-panel border border-gray-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#131b2b] text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-4 font-medium">Date</th>
                <th className="px-4 py-4 font-medium">Symbol</th>
                <th className="px-4 py-4 font-medium">Type</th>
                <th className="px-4 py-4 font-medium text-right">Entry Price</th>
                <th className="px-4 py-4 font-medium text-right">Entry Time</th>
                <th className="px-4 py-4 font-medium text-right">Exit Price</th>
                <th className="px-4 py-4 font-medium text-right">Exit Time</th>
                <th className="px-4 py-4 font-medium">Exit Reason</th>
                <th className="px-4 py-4 font-medium text-right">Qty</th>
                <th className="px-4 py-4 font-medium text-right">Invested</th>
                <th className="px-4 py-4 font-medium text-right">P&L</th>
                <th className="px-4 py-4 font-medium text-right">P&L %</th>
                <th className="px-4 py-4 font-medium text-center">Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              <tr className="hover:bg-orb-panel-hover transition-colors">
                <td className="px-4 py-3 text-gray-300 mono-nums">2023-10-27</td>
                <td className="px-4 py-3 font-medium text-gray-200">TATACONSUM</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-green-900/30 text-green-400 border border-green-800/50">
                    LONG
                  </span>
                </td>
                <td className="px-4 py-3 text-right mono-nums">1085.90</td>
                <td className="px-4 py-3 text-right mono-nums text-gray-400">11:56:21</td>
                <td className="px-4 py-3 text-right mono-nums">1090.10</td>
                <td className="px-4 py-3 text-right mono-nums text-gray-400">15:19:00</td>
                <td className="px-4 py-3 text-gray-300 text-xs">TIME_EXIT</td>
                <td className="px-4 py-3 text-right mono-nums">100</td>
                <td className="px-4 py-3 text-right mono-nums">1,08,590</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-green-400">+₹420</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-green-400">
                  +0.38%
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => setSelectedTrade("TATACONSUM")}
                    className="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors"
                    title="View Logs"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Shared Logs Modal */}
      {selectedTrade && (
        <TradeLogsModal symbol={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}
    </div>
  );
}
