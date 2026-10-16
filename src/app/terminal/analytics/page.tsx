"use client";

import { useEffect, useState } from "react";
import { useTerminal } from "@/lib/terminal/store";
import { api } from "@/lib/terminal/api";
import type { AnalyticsResult } from "@/lib/terminal/analytics";
import PerformanceView from "@/components/terminal/PerformanceView";
import { Badge, Empty, Panel, btn, td, tdr, th, thr } from "@/components/terminal";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";

export default function Analytics() {
  const t = useTerminal();
  const [sel, setSel] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data: AnalyticsResult;
    updated: string;
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const params = new URLSearchParams({ page: String(page) });
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
            <select
              aria-label="Analytics strategy"
              value={sel}
              onChange={(e) => {
                setSel(e.target.value);
                setPage(1);
              }}
              className={filterClass}
            >
              <option value="all">All strategies & manual trades</option>
              {(options.length ? options : t.strategies).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-slate-500">
            From
            <input
              aria-label="Analytics start date"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
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
                setPage(1);
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
              setPage(1);
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
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-slate-600 space-y-1">
            <p>
              <strong>{data.totalTrades} closed trades</strong> ·{" "}
              {data.dateFrom ?? "First saved trade"} through {data.dateTo} (inclusive, exchange
              trade dates) · Configured capital {inr(data.capital)}.
            </p>
            <p>
              Realized P&L only; open positions are excluded. Saved history may include earlier
              simulated paper runs. Equity starts at the current configured capital; capital changes
              are not tracked.
            </p>
            <p>
              Max drawdown uses closed-trade equity observations; charts show daily closing equity.
              Sharpe uses days with closed trades, sample standard deviation, zero risk-free rate
              and √252 annualization. It does not include unobserved sessions or intraday unrealized
              drawdowns.
            </p>
          </div>
          {data.totalTrades ? (
            <PerformanceView result={data} />
          ) : (
            <Panel title="No closed trades">
              <Empty text="No closed trades match these filters. Select another strategy or date range; analytics populate when positions close." />
            </Panel>
          )}
          <Panel
            title={`Closed trade history (${data.totalTrades})`}
            right={
              <span className="text-xs text-slate-500">
                Recorded fees: {inr(data.metrics.fees, 2)}
              </span>
            }
          >
            {!data.trades.length ? (
              <Empty text="No trades on this page." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Closed (IST)",
                        "Symbol / strategy",
                        "Side",
                        "Qty",
                        "Entry",
                        "Exit",
                        "Fees",
                        "Net P&L",
                        "Reason",
                      ].map((label, i) => (
                        <th key={label} className={i < 3 || i === 8 ? th : thr}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.trades.map((trade) => (
                      <tr key={trade.id}>
                        <td className={td}>
                          {trade.tradeDate} {trade.closedAt}
                        </td>
                        <td className={td}>
                          <strong>{trade.symbol}</strong>
                          <span className="block text-[11px] text-slate-400 mt-1">
                            {trade.strategyName}
                          </span>
                        </td>
                        <td className={td}>
                          <Badge tone={trade.side === "BUY" ? "green" : "red"}>{trade.side}</Badge>
                        </td>
                        <td className={tdr}>{trade.qty}</td>
                        <td className={tdr}>{num(trade.entry)}</td>
                        <td className={tdr}>{num(trade.exit)}</td>
                        <td className={tdr}>{inr(trade.fees, 2)}</td>
                        <td className={`${tdr} ${pnlColor(trade.pnl)}`}>{signed(trade.pnl, 2)}</td>
                        <td className={td}>{trade.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-4 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {data.totalPages ? data.page : 0} of {data.totalPages} · Totals and charts
                include every matching trade.
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className={`${btn} bg-slate-100`}
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className={`${btn} bg-slate-100`}
                >
                  Next
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
