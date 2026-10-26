"use client";

import Link from "next/link";
import { Select } from "@/components/terminal/ui";
import { useEffect, useState } from "react";
import { useTerminal } from "@/components/terminal/context";
import { api } from "@/utils/api";
import type { AnalyticsResult } from "@/utils/analytics";
import PerformanceView from "@/components/terminal/PerformanceView";
import { Empty, Panel, btn } from "@/components/terminal";

export default function Analytics() {
  const t = useTerminal();
  const [sel, setSel] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data: AnalyticsResult;
    updated: string;
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const params = new URLSearchParams();
  if (sel !== "all") params.set("strategy_id", sel);
  if (from) params.set("date_from", from);
  if (to || t.marketDate) params.set("date_to", to || t.marketDate);
  const query = params.toString();

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setUpdating(true);
      try {
        const data = await api<AnalyticsResult>("GET", `/analytics?${query}`, undefined, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResponse({
            key: query,
            data,
            updated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
          });
          setOptions(data.strategies);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError({
            key: query,
            message: e instanceof Error ? e.message : "Unable to load analytics",
          });
      } finally {
        if (!controller.signal.aborted) {
          setUpdating(false);
          timer = setTimeout(load, 10000);
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, retry]);

  const data = response?.key === query ? response.data : null;
  const failure = error?.key === query ? error.message : null;
  const filterClass =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800";

  return (
    <div className="max-w-[1600px] w-full mx-auto space-y-5 text-slate-900 pb-8">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Performance from saved closed trades, net of recorded fees.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {updating
            ? "Updating…"
            : response?.key === query
              ? `Updated ${response.updated} IST`
              : ""}
          <button
            onClick={() => setRetry((r) => r + 1)}
            disabled={updating}
            className={`${btn} ml-2 bg-blue-50 text-blue-600`}
          >
            Refresh
          </button>
        </div>
      </div>
      <Panel>
        <div className="p-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-slate-500">
            Strategy
            <Select
              aria-label="Analytics strategy"
              value={sel}
              onChange={(value) => {
                setSel(value);
              }}
              className="min-w-64"
              size="sm"
              options={[
                { value: "all", label: "All strategies & manual trades" },
                ...(options.length ? options : t.strategies).map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-slate-500">
            From
            <input
              aria-label="Analytics start date"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
              className={filterClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-slate-500">
            Through
            <input
              aria-label="Analytics end date"
              type="date"
              value={to || t.marketDate}
              onChange={(e) => {
                setTo(e.target.value);
              }}
              className={filterClass}
            />
          </label>
          <button
            className={`${btn} text-blue-600 bg-blue-50`}
            onClick={() => {
              setSel("all");
              setFrom("");
              setTo("");
            }}
          >
            Reset filters
          </button>
        </div>
      </Panel>
      {failure && (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {failure} {data && "Showing the last successful update."}
          <button className="ml-2 underline" onClick={() => setRetry((r) => r + 1)}>
            Retry
          </button>
        </p>
      )}
      {!data && !failure && (
        <Panel>
          <p role="status" className="p-8 text-sm text-slate-500 text-center">
            Loading saved trade analytics…
          </p>
        </Panel>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <p>
              {data.dateFrom ?? "All saved trades"} through {data.dateTo} · Closed trades, after
              fees
            </p>
            <Link href="/terminal/history" className="font-semibold text-blue-600 hover:underline">
              View trade history →
            </Link>
          </div>
          {data.totalTrades ? (
            <PerformanceView result={data} />
          ) : (
            <Panel title="No closed trades">
              <Empty text="No closed trades match these filters. Select another strategy or date range; analytics populate when positions close." />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
