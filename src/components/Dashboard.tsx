"use client";

import React, { useEffect, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

type Tick = {
  symbol: string;
  ltp: number;
  high: number;
  low: number;
  volume: number;
  time?: string;
};

type ChartData = {
  time: string;
  NIFTY: number | null;
  BANKNIFTY: number | null;
};

export default function Dashboard() {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to FastAPI WebSocket using environment variable (fallback to localhost)
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8001/ws/market-data";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data: Tick = JSON.parse(event.data);
      const currentTime = new Date().toLocaleTimeString();
      data.time = currentTime;

      setTicks((prev) => ({
        ...prev,
        [data.symbol]: data,
      }));

      setChartData((prev) => {
        const newData = [...prev];
        const lastEntry = newData[newData.length - 1];
        
        // Update existing time entry if it's in the same second, else create new
        if (lastEntry && lastEntry.time === currentTime) {
          lastEntry[data.symbol as keyof ChartData] = data.ltp as any;
        } else {
          newData.push({
            time: currentTime,
            NIFTY: data.symbol === "NIFTY" ? data.ltp : lastEntry?.NIFTY || null,
            BANKNIFTY: data.symbol === "BANKNIFTY" ? data.ltp : lastEntry?.BANKNIFTY || null,
          });
        }
        
        // Keep last 30 data points for smooth chart
        if (newData.length > 30) {
          newData.shift();
        }
        return newData;
      });
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const getPriceColor = (symbol: string, currentPrice: number) => {
    // Simple heuristic: compare with average of history for color
    if (chartData.length < 2) return "text-gray-900";
    const previousPrice = chartData[chartData.length - 2][symbol as keyof ChartData] as number;
    if (!previousPrice) return "text-gray-900";
    return currentPrice >= previousPrice ? "text-green-600" : "text-red-600";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-8 w-8 text-blue-600" />
            Algo Trading Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Status:</span>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isConnected ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
              {isConnected ? "Live" : "Disconnected"}
            </div>
          </div>
        </div>

        {/* Ticker Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {["NIFTY", "BANKNIFTY"].map((symbol) => {
            const tick = ticks[symbol];
            return (
              <div key={symbol} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">{symbol}</h2>
                {tick ? (
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-bold ${getPriceColor(symbol, tick.ltp)}`}>
                        {tick.ltp.toFixed(2)}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">LTP</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-50">
                      <div>
                        <p className="text-sm text-gray-500">High</p>
                        <p className="font-semibold text-gray-700">{tick.high.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Low</p>
                        <p className="font-semibold text-gray-700">{tick.low.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Volume</p>
                        <p className="font-semibold text-gray-700">{tick.volume.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-400">
                    Waiting for data...
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Charts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Live Price Action</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#6b7280' }} minTickGap={30} />
                <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#6b7280' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="NIFTY"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="BANKNIFTY"
                  stroke="#db2777"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
