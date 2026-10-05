import { Download } from "lucide-react";

export default function FinbabaDashboard() {
  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-8">
      
      {/* Open Positions Panel */}
      <div className="bg-fin-panel border border-gray-800 rounded-lg overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
            <h2 className="text-lg font-semibold text-white tracking-wide">Open Positions</h2>
          </div>
          <button className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded transition-colors text-sm font-medium">
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#151515] text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Candle</th>
                <th className="px-4 py-3 font-medium">Exact Entry</th>
                <th className="px-4 py-3 font-medium text-right">Entry Price</th>
                <th className="px-4 py-3 font-medium text-right">BEES Price</th>
                <th className="px-4 py-3 font-medium text-right">ISL</th>
                <th className="px-4 py-3 font-medium text-right">CSL</th>
                <th className="px-4 py-3 font-medium text-center">Level</th>
                <th className="px-4 py-3 font-medium text-right">LTP</th>
                <th className="px-4 py-3 font-medium text-right">Index P&L</th>
                <th className="px-4 py-3 font-medium text-right">ACC1 P&L</th>
                <th className="px-4 py-3 font-medium text-right">ACC2 P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              <tr className="hover:bg-fin-panel-hover transition-colors group">
                <td className="px-4 py-3"><span className="bg-blue-900/50 text-blue-300 font-bold px-2 py-1 rounded text-xs">C4</span></td>
                <td className="px-4 py-3 text-gray-300 mono-nums">2023-10-27</td>
                <td className="px-4 py-3 text-gray-300 mono-nums">09:15</td>
                <td className="px-4 py-3 text-gray-300 mono-nums">19500.25</td>
                <td className="px-4 py-3 text-right mono-nums">19510.00</td>
                <td className="px-4 py-3 text-right mono-nums">195.10</td>
                <td className="px-4 py-3 text-right mono-nums text-gray-500">19450.00</td>
                <td className="px-4 py-3 text-right mono-nums font-bold text-amber-500 bg-amber-900/20">19480.00</td>
                <td className="px-4 py-3 text-center"><span className="bg-amber-500/20 text-amber-500 font-bold px-2 py-0.5 rounded text-xs">L0</span></td>
                <td className="px-4 py-3 text-right mono-nums font-bold text-white">19535.50</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-green-500">+25.50</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-green-500">+₹1,275</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-green-500">+₹1,275</td>
              </tr>
              <tr className="hover:bg-fin-panel-hover transition-colors group">
                <td className="px-4 py-3"><span className="bg-purple-900/50 text-purple-300 font-bold px-2 py-1 rounded text-xs">B5</span></td>
                <td className="px-4 py-3 text-gray-300 mono-nums">2023-10-27</td>
                <td className="px-4 py-3 text-gray-300 mono-nums">10:00</td>
                <td className="px-4 py-3 text-gray-300 mono-nums">43200.00</td>
                <td className="px-4 py-3 text-right mono-nums">43210.00</td>
                <td className="px-4 py-3 text-right mono-nums">432.10</td>
                <td className="px-4 py-3 text-right mono-nums text-gray-500">43100.00</td>
                <td className="px-4 py-3 text-right mono-nums font-bold text-amber-500 bg-amber-900/20">43150.00</td>
                <td className="px-4 py-3 text-center"><span className="bg-amber-500/20 text-amber-500 font-bold px-2 py-0.5 rounded text-xs">L4</span></td>
                <td className="px-4 py-3 text-right mono-nums font-bold text-white">43180.00</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-red-500">-30.00</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-red-500">-₹450</td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-red-500">-₹450</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Exits Panel */}
      <div className="bg-fin-panel border border-gray-800 rounded-lg overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
          <h2 className="text-lg font-semibold text-white tracking-wide">Recent Exits</h2>
          <button className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded transition-colors text-sm font-medium">
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#151515] text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Candle</th>
                <th className="px-4 py-3 font-medium">Exact Entry</th>
                <th className="px-4 py-3 font-medium text-right">Entry</th>
                <th className="px-4 py-3 font-medium text-right">Exit</th>
                <th className="px-4 py-3 font-medium text-right">Exit Time</th>
                <th className="px-4 py-3 font-medium text-center">Level</th>
                <th className="px-4 py-3 font-medium text-right">Index P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              <tr className="hover:bg-fin-panel-hover transition-colors group">
                <td className="px-4 py-3"><span className="bg-purple-900/50 text-purple-300 font-bold px-2 py-1 rounded text-xs">B3</span></td>
                <td className="px-4 py-3 text-gray-300 mono-nums">2023-10-27</td>
                <td className="px-4 py-3 text-gray-300 mono-nums">09:30</td>
                <td className="px-4 py-3 text-gray-300 mono-nums">43050.00</td>
                <td className="px-4 py-3 text-right mono-nums">43060.00</td>
                <td className="px-4 py-3 text-right mono-nums">43100.00</td>
                <td className="px-4 py-3 text-right mono-nums text-gray-400">10:15</td>
                <td className="px-4 py-3 text-center"><span className="bg-amber-500/20 text-amber-500 font-bold px-2 py-0.5 rounded text-xs">L0</span></td>
                <td className="px-4 py-3 text-right mono-nums font-medium text-green-500">+40.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
