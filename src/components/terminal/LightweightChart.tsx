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

type CandleHistory = Omit<CandleBar, "time"> & { time: string | number };

export function LightweightChart({ symbol, height }: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastTimeRef = useRef<number>(0);

  const { prices } = useTerminal();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let isMounted = true;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b", // slate-500
        fontSize: 11,
        fontFamily: getComputedStyle(chartContainerRef.current).fontFamily,
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
    api<CandleHistory[] | { data?: CandleHistory[] }>(
      "GET",
      `/history/${encodeURIComponent(symbol)}`
    )
      .then((res) => {
        if (!isMounted || !chartRef.current || !seriesRef.current) return;
        const rawBars = Array.isArray(res) ? res : res?.data || [];
        if (rawBars.length > 0) {
          const formatted = rawBars
            .map((bar) => {
              let t = bar.time;
              if (typeof t === "string") {
                const ts = Math.floor(Date.parse(t.includes("T") ? t : t.replace(" ", "T")) / 1000);
                if (!isNaN(ts)) t = ts;
              }
              return {
                time: t as Time,
                open: Number(bar.open),
                high: Number(bar.high),
                low: Number(bar.low),
                close: Number(bar.close),
              };
            })
            .filter(
              (bar) =>
                typeof bar.time === "number" &&
                [bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)
            )
            .sort((a, b) => Number(a.time) - Number(b.time))
            .filter((b, idx, arr) => idx === 0 || Number(b.time) > Number(arr[idx - 1].time));

          if (formatted.length > 0 && isMounted && seriesRef.current) {
            try {
              series.setData(formatted);
              lastTimeRef.current = formatted[formatted.length - 1].time as number;
            } catch {
              // Ignore if already disposed
            }
          }
        }
      })
      .catch((err) => {
        if (isMounted) console.error(err);
      });

    const handleResize = () => {
      if (!isMounted || !chartRef.current || !chartContainerRef.current) return;
      try {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height ?? chartContainerRef.current.clientHeight,
        });
      } catch {
        // Ignore if disposed
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(chartContainerRef.current);

    return () => {
      isMounted = false;
      ro.disconnect();
      seriesRef.current = null;
      chartRef.current = null;
      lastTimeRef.current = 0;
      try {
        chart.remove();
      } catch {
        // Ignore if already removed
      }
    };
  }, [symbol, height]);

  // Real-time updates based on price stream
  useEffect(() => {
    const ltp = prices[symbol];
    const series = seriesRef.current;
    if (!ltp || !series || lastTimeRef.current === 0) return;

    try {
      const allData = series.data();
      if (!allData || allData.length === 0) return;
      const lastData = allData[allData.length - 1] as CandleBar | undefined;
      if (lastData && "close" in lastData) {
        series.update({
          time: lastData.time,
          open: lastData.open,
          high: Math.max(lastData.high, ltp),
          low: Math.min(lastData.low, ltp),
          close: ltp,
        });
      }
    } catch {
      // Ignore if disposed during unmount
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
