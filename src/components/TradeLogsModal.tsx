"use client";

import { X } from "lucide-react";

interface TradeLogsModalProps {
  symbol: string;
  onClose: () => void;
}

export function TradeLogsModal({ symbol, onClose }: TradeLogsModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header with Title and Close Button */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between bg-[#131b2b]">
          <h3 className="text-lg font-medium text-white tracking-wide">Logs – {symbol}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Five-column Event Table */}
        <div className="overflow-auto flex-1 bg-[#111827]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#0b0f19] text-gray-400 text-xs uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-6 py-4 font-medium border-b border-gray-800">Time</th>
                <th className="px-6 py-4 font-medium border-b border-gray-800">Price</th>
                <th className="px-6 py-4 font-medium border-b border-gray-800">SL</th>
                <th className="px-6 py-4 font-medium border-b border-gray-800">Event</th>
                <th className="px-6 py-4 font-medium border-b border-gray-800 w-full">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              <tr className="hover:bg-[#1f2937] transition-colors">
                <td className="px-6 py-4 mono-nums text-gray-300">11:56:21</td>
                <td className="px-6 py-4 mono-nums text-gray-200">₹1,085.90</td>
                <td className="px-6 py-4 mono-nums text-gray-400">₹1,075.04</td>
                <td className="px-6 py-4">
                  <span className="text-xs bg-gray-800 text-gray-200 px-2 py-1 rounded font-medium">
                    ENTRY
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300">LONG entry at 1085.9, SL=1075.04</td>
              </tr>
              <tr className="hover:bg-[#1f2937] transition-colors">
                <td className="px-6 py-4 mono-nums text-gray-300">15:19:00</td>
                <td className="px-6 py-4 mono-nums text-gray-200">₹1,090.10</td>
                <td className="px-6 py-4 mono-nums text-gray-400">₹1,075.04</td>
                <td className="px-6 py-4">
                  <span className="text-xs bg-gray-800 text-gray-200 px-2 py-1 rounded font-medium">
                    EXIT_TIME_EXIT
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300">Exit at 1090.1, Reason: TIME_EXIT</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
