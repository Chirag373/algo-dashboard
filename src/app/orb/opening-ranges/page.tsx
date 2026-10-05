"use client";

export default function OpeningRanges() {
  const ranges = [
    {
      symbol: "RELIANCE",
      open: 2950.0,
      high: 2965.5,
      low: 2940.0,
      close: 2960.0,
      rangePct: 0.86,
      highBroken: "YES",
      lowBroken: "NO",
    },
    {
      symbol: "TCS",
      open: 3900.0,
      high: 3915.0,
      low: 3890.0,
      close: 3895.0,
      rangePct: 0.64,
      highBroken: "NO",
      lowBroken: "YES",
    },
    {
      symbol: "HDFCBANK",
      open: 1450.0,
      high: 1455.0,
      low: 1445.0,
      close: 1452.0,
      rangePct: 0.69,
      highBroken: "YES",
      lowBroken: "NO",
    },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="bg-orb-panel border border-gray-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-gray-800 bg-[#0f1522] flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-200 tracking-wide">
            Today&apos;s Opening Ranges (9:15 – 9:30)
          </h2>
          <span className="text-sm text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full">
            {213} stocks
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#131b2b] text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Symbol</th>
                <th className="px-6 py-4 font-medium text-right">Open</th>
                <th className="px-6 py-4 font-medium text-right">High</th>
                <th className="px-6 py-4 font-medium text-right">Low</th>
                <th className="px-6 py-4 font-medium text-right">Close</th>
                <th className="px-6 py-4 font-medium text-right">Range %</th>
                <th className="px-6 py-4 font-medium text-center">High Broken</th>
                <th className="px-6 py-4 font-medium text-center">Low Broken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {ranges.map((row, i) => (
                <tr key={i} className="hover:bg-orb-panel-hover transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-200">{row.symbol}</td>
                  <td className="px-6 py-3 text-right mono-nums">{row.open.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right mono-nums text-green-400">
                    {row.high.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right mono-nums text-red-400">
                    {row.low.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right mono-nums">{row.close.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right mono-nums">{row.rangePct}%</td>
                  <td className="px-6 py-3 text-center mono-nums">
                    <span
                      className={`text-xs px-2 py-1 rounded font-bold ${row.highBroken === "YES" ? "bg-green-900/40 text-green-400" : "text-gray-500"}`}
                    >
                      {row.highBroken}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center mono-nums">
                    <span
                      className={`text-xs px-2 py-1 rounded font-bold ${row.lowBroken === "YES" ? "bg-red-900/40 text-red-400" : "text-gray-500"}`}
                    >
                      {row.lowBroken}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
