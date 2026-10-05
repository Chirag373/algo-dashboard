"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { TradeLogsModal } from "@/components/TradeLogsModal";

type Trade = {
  id: string;
  symbol: string;
  type: "LONG" | "SHORT";
  entryPrice: number;
  entryTime: string;
  exitPrice: number;
  exitTime: string;
  exitReason: string;
  qty: number;
  amount: number;
  pnl: number;
  pnlPercent: number;
};

const mockTrades: Trade[] = [
  {
    id: "1",
    symbol: "TATACONSUM",
    type: "LONG",
    entryPrice: 1085.9,
    entryTime: "11:56:21",
    exitPrice: 1090.1,
    exitTime: "15:19:00",
    exitReason: "TIME_EXIT",
    qty: 100,
    amount: 108590,
    pnl: 420,
    pnlPercent: 0.38,
  },
  {
    id: "2",
    symbol: "RELIANCE",
    type: "SHORT",
    entryPrice: 2950.0,
    entryTime: "09:16:05",
    exitPrice: 2965.5,
    exitTime: "09:20:15",
    exitReason: "SL",
    qty: 50,
    amount: 147500,
    pnl: -775,
    pnlPercent: -0.52,
  },
];

export default function OrbDashboardContent() {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "TODAY&apos;S P&L", value: "₹3,138.09", color: "text-green-400" },
          { label: "TOTAL TRADES", value: "82", color: "text-white" },
          { label: "WIN RATE", value: "73.17%", color: "text-white" },
          { label: "OPEN POSITIONS", value: "0", color: "text-white" },
          { label: "CAPITAL USED", value: "₹0", color: "text-white" },
          { label: "FREE CAPITAL", value: "₹2,97,501.98", color: "text-white" },
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-orb-panel border border-gray-800 rounded-xl p-4 flex flex-col justify-center"
          >
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">
              {stat.label}
            </span>
            <span className={`text-2xl font-bold mono-nums ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Closed Trades Table */}
      <div className="bg-orb-panel border border-gray-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 border-b border-gray-800 bg-[#0f1522]">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            Today&apos;s Closed Trades
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#131b2b] text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Entry Price</th>
                <th className="px-4 py-3 font-medium text-right">Entry Time</th>
                <th className="px-4 py-3 font-medium text-right">Exit Price</th>
                <th className="px-4 py-3 font-medium text-right">Exit Time</th>
                <th className="px-4 py-3 font-medium">Exit Reason</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">P&L</th>
                <th className="px-4 py-3 font-medium text-right">P&L %</th>
                <th className="px-4 py-3 font-medium text-center">Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {mockTrades.map((trade) => (
                <tr key={trade.id} className="hover:bg-orb-panel-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-200">{trade.symbol}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full font-bold tracking-wide ${
                        trade.type === "LONG"
                          ? "bg-green-900/30 text-green-400 border border-green-800/50"
                          : "bg-red-900/30 text-red-400 border border-red-800/50"
                      }`}
                    >
                      {trade.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right mono-nums">{trade.entryPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right mono-nums text-gray-400">
                    {trade.entryTime}
                  </td>
                  <td className="px-4 py-3 text-right mono-nums">{trade.exitPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right mono-nums text-gray-400">{trade.exitTime}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{trade.exitReason}</td>
                  <td className="px-4 py-3 text-right mono-nums">{trade.qty}</td>
                  <td className="px-4 py-3 text-right mono-nums">
                    ₹{trade.amount.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-3 text-right mono-nums font-medium ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {trade.pnl >= 0 ? "+" : ""}₹{trade.pnl.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-3 text-right mono-nums font-medium ${trade.pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {trade.pnlPercent >= 0 ? "+" : ""}
                    {trade.pnlPercent}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setSelectedTrade(trade)}
                      className="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors"
                      title="View Logs"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shared Logs Modal */}
      {selectedTrade && (
        <TradeLogsModal symbol={selectedTrade.symbol} onClose={() => setSelectedTrade(null)} />
      )}
    </div>
  );
}
