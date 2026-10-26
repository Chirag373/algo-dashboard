import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickSeries,
  HistogramSeries,
  TickMarkType,
} from "lightweight-charts";
import { api } from "@/utils/api";

interface LightweightChartProps {
  symbol: string;
  timeframe?: string;
  daysBack?: number;
  height?: number;
}

interface CandleBar {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

type CandleHistory = Omit<CandleBar, "time"> & { time: string | number };

function chartDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(`${time}T00:00:00+05:30`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day) - 330 * 60 * 1000);
}

export function LightweightChart({
  symbol,
  timeframe = "5m",
  daysBack = 36525,
  height,
}: LightweightChartProps) {
  const [historyNotice, setHistoryNotice] = useState("");
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let isMounted = true;
    const controller = new AbortController();

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
      localization: {
        timeFormatter: (time: Time) =>
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(chartDate(time)) + " IST",
      },
      timeScale: {
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const options: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" };
          if (type === TickMarkType.Year) options.year = "numeric";
          else if (type === TickMarkType.Month) options.month = "short";
          else if (type === TickMarkType.DayOfMonth) {
            options.day = "2-digit";
            options.month = "short";
          } else {
            options.hour = "2-digit";
            options.minute = "2-digit";
            options.hourCycle = "h23";
          }
          return new Intl.DateTimeFormat("en-GB", options).format(chartDate(time));
        },
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

    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        title: "Volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: true,
      },
      1
    );
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.15, bottom: 0 },
    });
    chart.panes()[0].setStretchFactor(4);
    chart.panes()[1].setStretchFactor(1);

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let fitted = false;
    // Refresh provider OHLCV; engine quotes may belong to a different feed or session.
    const loadHistory = () =>
      api<CandleHistory[] | { data?: CandleHistory[] }>(
        "GET",
        `/history/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&limit=500000&days_back=${daysBack}`,
        undefined,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!isMounted || !chartRef.current || !seriesRef.current) return;
          const rawBars = Array.isArray(res) ? res : res?.data || [];
          if (rawBars.length > 0) {
            const formatted = rawBars
              .map((bar) => {
                let t = bar.time;
                if (typeof t === "string") {
                  // Exchange history without an offset is in IST, regardless of the browser timezone.
                  const normalized = t.replace(" ", "T");
                  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
                    ? normalized
                    : `${normalized.length === 10 ? normalized + "T00:00:00" : normalized}+05:30`;
                  const ts = Math.floor(Date.parse(timestamp) / 1000);
                  if (!isNaN(ts)) t = ts;
                }
                return {
                  time: t as Time,
                  open: Number(bar.open),
                  high: Number(bar.high),
                  low: Number(bar.low),
                  close: Number(bar.close),
                  volume:
                    bar.volume == null ||
                    !Number.isFinite(Number(bar.volume)) ||
                    Number(bar.volume) < 0
                      ? null
                      : Number(bar.volume),
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
                const firstTime = Number(formatted[0].time);
                const latestTime = Number(formatted[formatted.length - 1].time);
                setHistoryNotice(
                  latestTime - firstTime < Math.max(1, daysBack - 10) * 86400
                    ? "Showing available history. Coverage depends on the symbol’s listing date and the provider’s timeframe limits."
                    : ""
                );
                series.setData(formatted);
                volumeSeries.setData(
                  formatted.map((bar) =>
                    bar.volume == null
                      ? { time: bar.time }
                      : {
                          time: bar.time,
                          value: bar.volume,
                          color: bar.close >= bar.open ? "#10b98199" : "#f43f5e99",
                        }
                  )
                );
                if (!fitted) {
                  chart.timeScale().fitContent();
                  fitted = true;
                }
              } catch {
                // Ignore if already disposed
              }
            }
          }
        })
        .catch((err) => {
          if (isMounted) {
            setHistoryNotice(
              err instanceof Error ? err.message : "Unable to load chart candles. Please retry."
            );
          }
        })
        .finally(() => {
          if (isMounted) refreshTimer = setTimeout(loadHistory, 60000);
        });
    void loadHistory();

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
      controller.abort();
      clearTimeout(refreshTimer);
      ro.disconnect();
      seriesRef.current = null;
      chartRef.current = null;
      try {
        chart.remove();
      } catch {
        // Ignore if already removed
      }
    };
  }, [symbol, timeframe, daysBack, height]);

  return (
    <div className="relative w-full h-full" style={height ? { height } : undefined}>
      <div className="w-full h-full" ref={chartContainerRef} />
      {historyNotice && (
        <p className="absolute left-2 top-1 z-10 max-w-[80%] rounded bg-white/90 px-2 py-1 text-[10px] text-slate-500">
          {historyNotice}
        </p>
      )}
    </div>
  );
}
