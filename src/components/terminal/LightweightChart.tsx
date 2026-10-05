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
}

export function LightweightChart({ symbol }: LightweightChartProps) {
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
        textColor: "#94a3b8", // slate-400
      },
      grid: {
        vertLines: { color: "#1e293b" }, // slate-800
        horzLines: { color: "#1e293b" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
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
    api(`/history/${symbol}`)
      .then((res) => {
        if (res.ok && res.data.length > 0) {
          const formatted = res.data.map((b: unknown) => ({
            time: b.time as Time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }));
          series.setData(formatted);
          if (formatted.length > 0) {
            lastTimeRef.current = formatted[formatted.length - 1].time;
          }
        }
      })
      .catch(console.error);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [symbol]);

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

    const lastData = seriesRef.current.dataByIndex(seriesRef.current.data().length - 1) as unknown;
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

  return <div className="w-full h-[400px]" ref={chartContainerRef} />;
}
