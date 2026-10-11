"use client";

import { Shield, BarChart2, AlertTriangle, TrendingUp, ShieldCheck } from "lucide-react";

const STRATEGY_LIMITS = [
  {
    name: "Momentum Pro",
    desc: "NIFTY • Momentum",
    cap: "25,000",
    loss: "2,000",
    pos: "2",
    status: "Active",
  },
  {
    name: "Mean Reversion",
    desc: "BANKNIFTY • Reversal",
    cap: "20,000",
    loss: "1,500",
    pos: "2",
    status: "Active",
  },
  {
    name: "Breakout Scalper",
    desc: "FINNIFTY • Breakout",
    cap: "15,000",
    loss: "1,000",
    pos: "1",
    status: "Active",
  },
  {
    name: "EMA Crossover",
    desc: "NIFTY • Trend",
    cap: "10,000",
    loss: "1,000",
    pos: "1",
    status: "Paused",
  },
  {
    name: "Options Selling",
    desc: "NIFTY • Options",
    cap: "20,000",
    loss: "2,000",
    pos: "2",
    status: "Active",
  },
];

export default function Risk() {
  return (
    <div className="max-w-[1600px] w-full mx-auto flex flex-col space-y-6 text-slate-900 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Risk Management</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Set and monitor risk limits to protect your capital and control your trading activity.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Card 1 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Total Capital</div>
            <div className="text-xl font-bold mt-0.5 text-blue-600">₹ 1,00,000</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
              Allocated across all strategies
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <BarChart2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Current Exposure</div>
            <div className="text-xl font-bold mt-0.5 text-emerald-600">₹ 24,500</div>
            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">24.5% of capital</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Today&apos;s P&L</div>
            <div className="text-xl font-bold mt-0.5 text-rose-600">- ₹ 1,120</div>
            <div className="text-[10px] text-rose-600 font-medium mt-0.5">-1.12%</div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Open Positions</div>
            <div className="text-xl font-bold mt-0.5">3</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">Across 2 strategies</div>
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Risk Status</div>
            <div className="text-sm font-bold mt-0.5 flex items-center gap-1.5 text-emerald-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Within Limits
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
              All risk parameters are normal
            </div>
          </div>
        </div>
      </div>

      {/* Main Limits */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Global Risk Limits */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5 lg:w-[40%] flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-50 p-2 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Global Risk Limits</h2>
              <p className="text-[11px] text-slate-500">
                These limits apply to your entire account and all strategies.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Maximum Capital
              </label>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <span className="bg-slate-50 text-slate-500 px-3 py-1.5 border-r border-slate-200 text-xs">
                  ₹
                </span>
                <input
                  type="text"
                  defaultValue="1,00,000"
                  className="flex-1 px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Total capital allocated for trading</p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Risk per Trade
              </label>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <span className="bg-slate-50 text-slate-500 px-3 py-1.5 border-r border-slate-200 text-xs">
                  %
                </span>
                <input
                  type="text"
                  defaultValue="1"
                  className="flex-1 px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Percentage of capital to risk per trade
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Max Daily Loss
              </label>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <span className="bg-slate-50 text-slate-500 px-3 py-1.5 border-r border-slate-200 text-xs">
                  ₹
                </span>
                <input
                  type="text"
                  defaultValue="5,000"
                  className="flex-1 px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Stop trading for the day if this limit is reached
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Max Drawdown
              </label>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <span className="bg-slate-50 text-slate-500 px-3 py-1.5 border-r border-slate-200 text-xs">
                  %
                </span>
                <input
                  type="text"
                  defaultValue="10"
                  className="flex-1 px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Stop trading if drawdown exceeds this limit
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Max Open Positions
              </label>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <input
                  type="text"
                  defaultValue="5"
                  className="flex-1 px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Maximum number of open positions across all strategies
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Max Trades per Day
              </label>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <input
                  type="text"
                  defaultValue="10"
                  className="flex-1 px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Maximum number of trades per day</p>
            </div>
          </div>
        </div>

        {/* Strategy-wise Risk Limits */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5 lg:w-[60%] flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-2 rounded-lg">
                <BarChart2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Strategy-wise Risk Limits</h2>
                <p className="text-[11px] text-slate-500">
                  Set individual risk limits for each strategy. These override global limits.
                </p>
              </div>
            </div>
            <button className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
              All Strategies
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">Strategy</th>
                  <th className="pb-3 font-medium">Capital</th>
                  <th className="pb-3 font-medium">Max Loss (Day)</th>
                  <th className="pb-3 font-medium">Max Positions</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {STRATEGY_LIMITS.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <div className="font-bold text-slate-900">{s.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.desc}</div>
                    </td>
                    <td className="py-3 font-medium text-slate-900">₹ {s.cap}</td>
                    <td className="py-3 font-medium text-slate-900">₹ {s.loss}</td>
                    <td className="py-3 font-medium text-slate-900">{s.pos}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${s.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`}
                        ></div>
                        <span
                          className={`font-medium ${s.status === "Active" ? "text-emerald-600" : "text-amber-600"}`}
                        >
                          {s.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
