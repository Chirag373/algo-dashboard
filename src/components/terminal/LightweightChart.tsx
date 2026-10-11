import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickSeries,
} from "lightweight-charts";
import { useTerminal } from "@/lib/terminal/store";
import { api } from "@/lib/terminal/api";

interface LightweightChartProps {
  symbol: string;
  height?: number;
}

interface CandleBar {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function LightweightChart({ symbol, height }: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastTimeRef = useRef<number>(0);

  const { prices } = useTerminal();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b", // slate-500
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#f1f5f9" }, // slate-100
        horzLines: { color: "#f1f5f9" },
      },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#e2e8f0",
      },
      width: chartContainerRef.current.clientWidth,
      height: height ?? chartContainerRef.current.clientHeight,
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981", // emerald-500
      downColor: "#f43f5e", // rose-500
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    seriesRef.current = series;

    // Fetch history
    api<CandleBar[]>("GET", `/history/${symbol}`)
      .then((data) => {
        if (data.length > 0) {
          const formatted = data.map((bar) => ({
            time: bar.time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          }));
          series.setData(formatted);
          if (formatted.length > 0) {
            lastTimeRef.current = formatted[formatted.length - 1].time as number;
          }
        }
      })
      .catch(console.error);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height ?? chartContainerRef.current.clientHeight,
        });
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [symbol, height]);

  // Real-time updates based on price stream
  useEffect(() => {
    const ltp = prices[symbol];
    if (!ltp || !seriesRef.current) return;

    // Simulate real-time ticking by updating the current bar
    // or starting a new bar if 1 minute has passed.
    // We'll use a local interval approximation since we don't receive new 'time' per tick.

    // If we haven't set a base bar time, wait for history
    if (lastTimeRef.current === 0) return;

    // Since our backend generates a bar every "simulated" minute, the real time doesn't match backend time.
    // A proper fix would be backend pushing the new completed bar.
    // For now, let's just fetch the latest history every few seconds or poll it,
    // OR we can just use the latest price to update the LAST bar if time matches.
    // Actually, to make it look active, let's just update the close price of the last bar.

    const lastData = seriesRef.current.dataByIndex(
      seriesRef.current.data().length - 1
    ) as CandleBar | null;
    if (lastData) {
      // We just blindly update the last bar with the LTP to show live tick movement
      seriesRef.current.update({
        time: lastData.time,
        open: lastData.open,
        high: Math.max(lastData.high, ltp),
        low: Math.min(lastData.low, ltp),
        close: ltp,
      });
    }
  }, [prices, symbol]);

  return (
    <div
      className="w-full h-full"
      style={height ? { height } : undefined}
      ref={chartContainerRef}
    />
  );
}
