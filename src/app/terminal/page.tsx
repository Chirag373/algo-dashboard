"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { TrendingUp, Wallet, List, Trophy, ShieldCheck, ChevronDown } from "lucide-react";
import { Select } from "@/components/terminal/ui";
import { useTerminal, pnlOf, type Result } from "@/components/terminal/context";
import { inr, num, pnlColor, signed } from "@/utils/format";
import { Badge, Empty, Panel, Stat, td, tdr, th, thr, btn } from "@/components/terminal";
import { NiftyChart } from "@/components/terminal/NiftyChart";
import { ExecutionLog } from "@/components/terminal/ExecutionLog";
import type { Rule, Strategy } from "@/types";
import styles from "./dashboard.module.css";

function Rules({ rules, fallback }: { rules?: Rule[]; fallback: string }) {
  return (
    <div className="space-y-1 mt-2">
      {rules?.length ? (
        rules.map((r, i) => (
          <p key={i}>
            {i > 0 && <strong className="text-blue-600 mr-1">{r.connector ?? "AND"}</strong>}
            {r.indicator} {r.operator} {r.value}
          </p>
        ))
      ) : (
        <p className="text-slate-400">{fallback}</p>
      )}
    </div>
  );
}

export default function Overview() {
  const t = useTerminal();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState("all");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Result | null>(null);
  const stats = Object.values(t.strategyStats);
  const trades = stats.reduce((n, s) => n + s.trades, 0);
  const wins = stats.reduce((n, s) => n + s.wins, 0);
  const running = t.strategies.filter((s) => s.status === "running").length;
  const lossUsed =
    t.risk.maxDailyLoss > 0
      ? Math.min(100, Math.max(0, (-t.dayPnl / t.risk.maxDailyLoss) * 100))
      : 0;
  const positions = t.positions.filter((p) => selected === "all" || p.strategyId === selected);
  const closed = t.closed.filter((c) => selected === "all" || c.strategyId === selected);
  const enabled = t.ready && t.connection === "online";
  const nameOf = (id: string) =>
    t.strategies.find((s) => s.id === id)?.name ?? (id ? "Removed strategy" : "Manual trade");
  const perform = async (key: string, command: () => Promise<Result>) => {
    if (pending.has(key)) return;
    setPending((p) => new Set(p).add(key));
    try {
      setNotice(await command());
    } catch {
      setNotice({ ok: false, message: "The action failed. Please retry." });
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto space-y-5 text-slate-900 pb-8">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-xl font-bold mb-1">Trading dashboard</h1>
          <p className="text-xs text-slate-500">
            {t.ready
              ? `${running} of ${t.strategies.length} strategies running · ${t.mode === "paper" ? "Paper trading" : "Live trading"} · ${t.marketOpen ? "Market open" : "Market closed"}`
              : "Connecting to your trading engine…"}
          </p>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <Badge tone={t.connection === "online" ? "green" : "amber"}>{t.connection}</Badge>
          <p className="mt-1">
            {t.marketDate} {t.now !== "--:--:--" ? t.now : ""} {t.ready && "IST"}
          </p>
        </div>
      </div>
      {t.connection === "offline" && (
        <p role="alert" className="rounded-xl bg-amber-50 text-amber-800 p-3 text-xs">
          Backend disconnected. Displayed trading data may be out of date; reconnecting
          automatically.
        </p>
      )}
      {(t.killed || t.lossLimitHit) && (
        <p role="alert" className="rounded-xl bg-rose-50 text-rose-700 p-3 text-xs">
          {t.lossLimitHit ? "Daily loss limit reached." : "Kill switch is engaged."} New entries are
          blocked.{" "}
          <Link href="/terminal/risk" className="underline">
            Review risk controls
          </Link>
        </p>
      )}
      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`rounded-xl p-3 text-xs flex justify-between gap-3 ${notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
        >
          {notice.message}
          <button aria-label="Dismiss action message" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className={styles.summaryGrid}>
        <Stat
          label="Day P&L"
          value={t.ready ? signed(t.dayPnl, 2) : "—"}
          tone={pnlColor(t.dayPnl)}
          sub={`Realized today: ${signed(t.realizedPnl, 2)}`}
          icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
        />
        <Stat
          label="Open P&L"
          value={t.ready ? signed(t.openPnl, 2) : "—"}
          tone={pnlColor(t.openPnl)}
          sub="Unrealized across all open positions"
          icon={<Wallet className="w-5 h-5 text-blue-500" />}
        />
        <Stat
          label="Open Positions"
          value={t.ready ? t.positions.length : "—"}
          sub={`${t.positions.filter((p) => p.side === "BUY").length} Long · ${t.positions.filter((p) => p.side === "SELL").length} Short`}
          icon={<List className="w-5 h-5 text-purple-500" />}
        />
        <Stat
          label="Win Rate · All time"
          value={trades ? `${((wins / trades) * 100).toFixed(1)}%` : "—"}
          sub={`${wins} wins / ${trades} closed trades`}
          icon={<Trophy className="w-5 h-5 text-amber-500" />}
        />
      </div>

      <div className="flex justify-end">
        <label className="text-xs text-slate-500 flex items-center gap-2">
          Positions & trade history
          <Select
            aria-label="Filter positions and trades by strategy"
            value={selected}
            onChange={setSelected}
            size="sm"
            className="w-60"
            options={[
              { value: "all", label: "All strategies & manual trades" },
              ...t.strategies.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </label>
      </div>
      <div className={styles.positionsGrid}>
        <Panel
          title={`Strategies (${t.strategies.length})`}
          right={
            <Link
              href="/terminal/strategies"
              className="text-xs text-blue-600 font-semibold hover:underline"
            >
              Manage strategies
            </Link>
          }
        >
          <p className="px-6 pb-3 text-xs text-slate-500">
            Every saved strategy, its positions and performance. Expand a row for rules, parameters
            and execution details. Realized P&L is net of fees across the full saved history.
          </p>
          {!t.strategies.length ? (
            <Empty
              text={
                t.ready
                  ? "No strategies saved. Create a strategy to get started."
                  : "Loading strategies…"
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-y border-slate-100">
                  <tr>
                    <th className={th}>Strategy / instrument</th>
                    <th className={th}>Status</th>
                    <th className={thr}>Positions</th>
                    <th className={thr}>Open P&L</th>
                    <th className={thr}>Realized P&L</th>
                    <th className={thr}>Today P&L</th>
                    <th className={thr}>Trades / win rate</th>
                    <th className={thr}>Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {t.strategies.map((s) => {
                    const sp = t.positions.filter((p) => p.strategyId === s.id);
                    const open = sp.reduce((n, p) => n + pnlOf(p), 0);
                    const summary = t.strategyStats[s.id];
                    const day = (summary?.dayRealizedPnl ?? 0) + open;
                    return (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-slate-50/60">
                          <td className={td}>
                            <button
                              aria-expanded={expanded === s.id}
                              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                              className="flex items-center gap-2 text-left"
                            >
                              <ChevronDown
                                className={`w-4 h-4 shrink-0 transition-transform ${expanded === s.id ? "rotate-180" : ""}`}
                              />
                              <span>
                                <span className="block font-semibold text-slate-900">{s.name}</span>
                                <span className="block mt-1 text-[11px] text-slate-400">
                                  {s.instrument} · {s.timeframe} · {s.template} · {s.stage} · v
                                  {s.version}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className={td}>
                            <Badge
                              tone={
                                s.status === "running"
                                  ? "green"
                                  : s.status === "paused"
                                    ? "amber"
                                    : "slate"
                              }
                            >
                              {s.status}
                            </Badge>
                          </td>
                          <td className={tdr}>
                            <button
                              onClick={() => setSelected(s.id)}
                              className="text-blue-600 hover:underline"
                              aria-label={`Show positions for ${s.name}`}
                            >
                              {sp.length} open
                            </button>
                          </td>
                          <td className={`${tdr} ${pnlColor(open)}`}>{signed(open, 2)}</td>
                          <td className={`${tdr} ${pnlColor(summary?.realizedPnl ?? 0)}`}>
                            {signed(summary?.realizedPnl ?? 0, 2)}
                          </td>
                          <td className={`${tdr} ${pnlColor(day)}`}>{signed(day, 2)}</td>
                          <td className={tdr}>
                            {summary?.trades ?? 0} /{" "}
                            {summary?.trades
                              ? `${((summary.wins / summary.trades) * 100).toFixed(0)}%`
                              : "—"}
                          </td>
                          <td className={tdr}>
                            <div className="flex justify-end gap-1.5">
                              <button
                                disabled={
                                  !enabled ||
                                  pending.has(s.id) ||
                                  (s.status !== "running" && t.killed)
                                }
                                onClick={() =>
                                  void perform(s.id, () =>
                                    t.setStrategyStatus(
                                      s.id,
                                      s.status === "running" ? "paused" : "running"
                                    )
                                  )
                                }
                                className={`${btn} bg-blue-50 text-blue-600 hover:bg-blue-100`}
                              >
                                {pending.has(s.id)
                                  ? "Updating…"
                                  : s.status === "running"
                                    ? "Pause"
                                    : s.status === "paused"
                                      ? "Resume"
                                      : "Start"}
                              </button>
                              {s.status !== "stopped" && (
                                <button
                                  disabled={!enabled || pending.has(s.id)}
                                  onClick={() =>
                                    void perform(s.id, () => t.setStrategyStatus(s.id, "stopped"))
                                  }
                                  className={`${btn} bg-slate-100 hover:bg-slate-200`}
                                >
                                  Stop
                                </button>
                              )}
                              <Link
                                href={`/terminal/strategies/${s.id}`}
                                className={`${btn} text-slate-500 hover:bg-slate-100`}
                              >
                                Edit
                              </Link>
                            </div>
                          </td>
                        </tr>
                        {expanded === s.id && (
                          <tr>
                            <td colSpan={8} className="px-6 py-4 bg-slate-50/60">
                              <StrategyDetails strategy={s} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title={`Open Positions (${positions.length})`}
          right={
            <Link href="/terminal/trading" className="text-xs text-blue-600 hover:underline">
              Trading terminal
            </Link>
          }
        >
          {!positions.length ? (
            <Empty
              text={
                t.ready
                  ? selected === "all"
                    ? "No open positions. Positions appear here when a strategy or manual order opens a trade."
                    : "No open positions for this strategy."
                  : "Loading positions…"
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-y border-slate-100">
                  <tr>
                    {[
                      "Symbol / strategy",
                      "Side",
                      "Qty",
                      "Avg. price",
                      "LTP",
                      "Stop loss",
                      "Target",
                      "P&L",
                      "Action",
                    ].map((h, i) => (
                      <th key={h} className={i < 2 ? th : thr}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>
                        <span className="font-bold">{p.symbol}</span>
                        <span className="block text-[11px] text-slate-400 mt-1">
                          {nameOf(p.strategyId)} · {p.openedAt}
                        </span>
                      </td>
                      <td className={td}>
                        <Badge tone={p.side === "BUY" ? "green" : "red"}>{p.side}</Badge>
                      </td>
                      <td className={tdr}>{p.qty}</td>
                      <td className={tdr}>{num(p.avg)}</td>
                      <td className={tdr}>{num(p.ltp)}</td>
                      <td className={tdr}>{p.sl > 0 ? num(p.sl) : "—"}</td>
                      <td className={tdr}>{p.target > 0 ? num(p.target) : "—"}</td>
                      <td className={`${tdr} font-bold ${pnlColor(pnlOf(p))}`}>
                        {signed(pnlOf(p), 2)}
                      </td>
                      <td className={tdr}>
                        <button
                          disabled={!enabled || pending.has(p.id)}
                          onClick={() => void perform(p.id, () => t.closePosition(p.id))}
                          className={`${btn} bg-rose-50 text-rose-600 hover:bg-rose-100`}
                        >
                          {pending.has(p.id) ? "Exiting…" : "Exit position"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className={styles.positionsGrid}>
        <div className="min-w-0">
          <NiftyChart />
        </div>
        <Panel
          title={
            <>
              <ShieldCheck className="w-4 h-4 text-blue-600" /> Risk & account
            </>
          }
          right={
            <Link href="/terminal/risk" className="text-xs text-blue-600 hover:underline">
              Manage
            </Link>
          }
        >
          <div className="px-6 pb-5 text-xs space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-slate-500">Daily loss used</span>
                <span>
                  {inr(Math.max(0, -t.dayPnl))} / {inr(t.risk.maxDailyLoss)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full ${lossUsed > 75 ? "bg-rose-500" : "bg-emerald-500"}`}
                  style={{ width: `${lossUsed}%` }}
                />
              </div>
              <p className="text-slate-400 text-[11px] mt-2">
                {lossUsed.toFixed(1)}% of daily loss limit. The engine enforces this limit
                automatically.
              </p>
            </div>
            <dl className="space-y-3">
              {[
                ["Configured capital", inr(t.risk.totalCapital)],
                ["Capital per trade limit", inr(t.risk.maxCapitalPerTrade)],
                ["Position capacity", `${t.positions.length} / ${t.risk.maxOpenPositions}`],
                ["Auto square-off", `${t.risk.autoSquareOffTime} IST`],
                ["Execution feed", t.feedKind],
                ["Kill switch", t.killed ? "Engaged" : "Off"],
              ].map(([label, value]) => (
                <div className="flex justify-between gap-3" key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      </div>

      <Panel
        title={`Recent closed trades (${closed.length})`}
        right={
          <Link href="/terminal/analytics" className="text-xs text-blue-600 hover:underline">
            Analytics
          </Link>
        }
      >
        <p className="px-6 pb-3 text-[11px] text-slate-400">
          Latest 200 closed trades across the account; strategy filter applies to this list.
          Performance totals above include the complete saved history.
        </p>
        {!closed.length ? (
          <Empty text="No closed trades for this selection." />
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {[
                    "Symbol / strategy",
                    "Closed at (IST)",
                    "Side",
                    "Qty",
                    "Entry",
                    "Exit",
                    "Fees",
                    "Net P&L",
                    "Exit reason",
                  ].map((h, i) => (
                    <th key={h} className={i < 3 || i === 8 ? th : thr}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closed.map((c) => (
                  <tr key={c.id}>
                    <td className={td}>
                      <span className="font-semibold">{c.symbol}</span>
                      <span className="block text-[11px] text-slate-400 mt-1">
                        {nameOf(c.strategyId)}
                      </span>
                    </td>
                    <td className={td}>
                      {c.tradeDate} {c.closedAt}
                    </td>
                    <td className={td}>{c.side}</td>
                    <td className={tdr}>{c.qty}</td>
                    <td className={tdr}>{num(c.entry)}</td>
                    <td className={tdr}>{num(c.exit)}</td>
                    <td className={tdr}>{inr(c.fees, 2)}</td>
                    <td className={`${tdr} ${pnlColor(c.pnl)}`}>{signed(c.pnl, 2)}</td>
                    <td className={td}>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function StrategyDetails({ strategy: s }: { strategy: Strategy }) {
  return (
    <div className="text-xs">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div>
          <h3 className="font-semibold">Entry conditions</h3>
          <Rules
            rules={s.entryRules}
            fallback={
              s.template === "ORB"
                ? "Native opening range breakout rules; see saved parameters."
                : "No custom entry conditions saved."
            }
          />
          <h3 className="font-semibold mt-4">Exit conditions</h3>
          <Rules
            rules={s.exitRules}
            fallback="No optional exit rules. Saved stop, target and square-off settings apply."
          />
        </div>
        <div>
          <h3 className="font-semibold mb-2">Saved parameters</h3>
          <dl className="space-y-1.5">
            {Object.entries(s.params).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-slate-500 break-all">{key.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="font-medium">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Execution status</h3>
          {Object.keys(s.execution ?? {}).length ? (
            <div className="space-y-3 max-h-64 overflow-auto">
              {Object.entries(s.execution ?? {}).map(([symbol, state]) => (
                <div key={symbol}>
                  <strong>{symbol}</strong>
                  <p className="text-slate-500 mt-1">
                    {state.message ?? "Waiting for a new completed candle."}
                  </p>
                  {state.lastCandle && (
                    <p className="text-slate-400 mt-1">
                      Last evaluated:{" "}
                      {new Date(state.lastCandle * 1000).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                      IST
                    </p>
                  )}
                  {state.conditions?.map((c, i) => (
                    <p className="mt-1" key={i}>
                      {c.indicator}: {c.left === null ? "Waiting" : num(c.left)} {c.operator}{" "}
                      {c.value}: {c.right === null ? "Waiting" : num(c.right)} ·{" "}
                      <span
                        className={
                          c.matched === null
                            ? "text-slate-400"
                            : c.matched
                              ? "text-emerald-600"
                              : "text-amber-600"
                        }
                      >
                        {c.matched === null ? "Unavailable" : c.matched ? "Met" : "Not met"}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">
              {s.status === "running"
                ? "Waiting for fresh market data and the next completed candle."
                : `Strategy is ${s.status}. Start or resume to evaluate new entry signals.`}
            </p>
          )}
        </div>
      </div>
      <ExecutionLog strategyId={s.id} />
    </div>
  );
}
