"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BarChart2, AlertTriangle, TrendingUp, ShieldCheck, Save } from "lucide-react";
import { useTerminal, type Result } from "@/components/terminal/context";
import type { RiskLimits, Strategy } from "@/types";
import { Badge, Panel, Stat, Empty, btn, td, tdr, th, thr } from "@/components/terminal";
import { inr, signed, pnlColor } from "@/utils/format";
import styles from "./risk.module.css";

type Draft = {
  strategyLimits: Record<string, { maxDailyLoss: string; maxOpenPositions: string }>;
};
function makeDraft(risk: RiskLimits, strategies: Strategy[]): Draft {
  return {
    strategyLimits: Object.fromEntries(
      strategies.map((s) => [
        s.id,
        {
          maxDailyLoss: String(risk.strategyLimits?.[s.id]?.maxDailyLoss ?? ""),
          maxOpenPositions: String(risk.strategyLimits?.[s.id]?.maxOpenPositions ?? ""),
        },
      ])
    ),
  };
}

export default function Risk() {
  const t = useTerminal();
  const status = t.riskStatus;
  const reason =
    t.connection !== "online"
      ? "Disconnected"
      : t.killed
        ? "Kill switch engaged"
        : t.lossLimitHit
          ? "Daily loss limit"
          : status?.drawdownLimitHit
            ? "Drawdown limit"
            : status?.tradeLimitHit
              ? "Daily entry limit"
              : t.positions.length >= t.risk.maxOpenPositions
                ? "Position limit"
                : "Within limits";
  const restricted = reason !== "Within limits";
  return (
    <div className="max-w-[1600px] w-full mx-auto space-y-6 text-slate-900 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Risk Management</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Set, save and monitor risk limits for your account and strategies.
        </p>
      </div>
      <div className={styles.stats}>
        <Stat
          label="Today's P&L"
          value={t.ready ? signed(t.dayPnl, 2) : "—"}
          tone={pnlColor(t.dayPnl)}
          sub="Realized + unrealized"
          icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
        />
        <Stat
          label="Open positions"
          value={t.ready ? t.positions.length : "—"}
          sub={`Across ${new Set(t.positions.map((p) => p.strategyId)).size} strategies / manual trades`}
          icon={<TrendingUp className="w-5 h-5 text-purple-600" />}
        />
        <Stat
          label="Risk status"
          value={t.ready ? reason : "Connecting…"}
          tone={restricted ? "text-amber-700" : "text-emerald-600"}
          sub={restricted ? "New entries may be blocked" : "Account checks are within limits"}
          icon={<ShieldCheck className="w-5 h-5 text-amber-500" />}
        />
      </div>
      {t.connection !== "online" && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
          Backend disconnected. Reconnecting automatically; saving is unavailable until the
          connection returns.
        </p>
      )}
      {t.ready ? (
        <RiskEditor />
      ) : (
        <Panel>
          <Empty text="Loading saved risk limits…" />
        </Panel>
      )}
    </div>
  );
}

function RiskEditor() {
  const t = useTerminal();
  const [draft, setDraft] = useState<Draft>(() => makeDraft(t.risk, t.strategies));
  const [baseline, setBaseline] = useState(() => JSON.stringify(makeDraft(t.risk, t.strategies)));
  const [saving, setSaving] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [message, setMessage] = useState<Result | null>(null);
  const dirty = JSON.stringify(draft) !== baseline;
  const connected = t.connection === "online";
  const changeStrategy = (id: string, key: "maxDailyLoss" | "maxOpenPositions", value: string) => {
    setDraft((d) => ({
      ...d,
      strategyLimits: {
        ...d.strategyLimits,
        [id]: {
          ...(d.strategyLimits[id] ?? { maxDailyLoss: "", maxOpenPositions: "" }),
          [key]: value,
        },
      },
    }));
    setMessage(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!connected || saving) return;
    const limits = Object.fromEntries(
      t.strategies.map((s) => {
        const row = draft.strategyLimits[s.id];
        return [
          s.id,
          {
            maxDailyLoss: row?.maxDailyLoss ? Number(row.maxDailyLoss) : null,
            maxOpenPositions: row?.maxOpenPositions ? Number(row.maxOpenPositions) : null,
          },
        ];
      })
    );
    const risk: RiskLimits = { ...t.risk, strategyLimits: limits };
    if (
      Object.values(limits).some(
        (limit) =>
          (limit.maxDailyLoss !== null &&
            (!Number.isFinite(limit.maxDailyLoss) || limit.maxDailyLoss <= 0)) ||
          (limit.maxOpenPositions !== null &&
            (!Number.isInteger(limit.maxOpenPositions) ||
              limit.maxOpenPositions < 1 ||
              limit.maxOpenPositions > 100))
      )
    ) {
      setMessage({
        ok: false,
        message:
          "Daily loss limits must be positive amounts. Position limits must be whole numbers from 1 to 100.",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await t.updateRisk(risk);
      setMessage(
        result.ok
          ? {
              ok: true,
              message: `Risk limits saved at ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST.`,
            }
          : result
      );
      if (result.ok) setBaseline(JSON.stringify(draft));
    } catch {
      setMessage({ ok: false, message: "Unable to save risk limits. Please retry." });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className={styles.columns}>
        <Panel
          title={
            <>
              <BarChart2 className="w-5 h-5 text-blue-600" /> Strategy-wise Risk Limits
            </>
          }
          right={
            <Link href="/terminal/strategies" className="text-xs text-blue-600 hover:underline">
              All strategies
            </Link>
          }
        >
          <p className="px-6 pb-4 text-xs text-slate-500">
            Strategy limits apply alongside global limits. Leave fields blank for no additional
            strategy limit. A strategy daily-loss breach blocks its entries for the day and closes
            its positions as fresh quotes arrive.
          </p>
          {!t.strategies.length ? (
            <Empty text="No saved strategies. Global limits still apply to manual trades." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Strategy</th>
                    <th className={thr}>Max loss / day (₹)</th>
                    <th className={thr}>Max positions</th>
                    <th className={thr}>Today P&L</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {t.strategies.map((s) => {
                    const status = t.riskStatus?.strategies[s.id];
                    return (
                      <tr key={s.id}>
                        <td className={td}>
                          <strong>{s.name}</strong>
                          <span className="block mt-1 text-[11px] text-slate-400">
                            {s.instrument} · {s.timeframe}
                          </span>
                        </td>
                        <td className={tdr}>
                          <input
                            aria-label={`${s.name} max daily loss`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            disabled={saving}
                            placeholder="No extra limit"
                            value={draft.strategyLimits[s.id]?.maxDailyLoss ?? ""}
                            onChange={(e) => changeStrategy(s.id, "maxDailyLoss", e.target.value)}
                            className="w-32 rounded-lg border border-slate-200 px-2 py-2 text-right text-xs"
                          />
                        </td>
                        <td className={tdr}>
                          <input
                            aria-label={`${s.name} max positions`}
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            disabled={saving}
                            placeholder="—"
                            value={draft.strategyLimits[s.id]?.maxOpenPositions ?? ""}
                            onChange={(e) =>
                              changeStrategy(s.id, "maxOpenPositions", e.target.value)
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-right text-xs"
                          />
                        </td>
                        <td className={`${tdr} ${pnlColor(status?.dayPnl ?? 0)}`}>
                          {status ? signed(status.dayPnl, 2) : "—"}
                        </td>
                        <td className={td}>
                          <Badge
                            tone={
                              status?.blocked ? "red" : s.status === "running" ? "green" : "slate"
                            }
                          >
                            {status?.blocked ? "Loss limit hit" : s.status}
                          </Badge>
                          <span className="block text-[11px] text-slate-400 mt-1">
                            {status?.positions ?? 0} open
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <Panel>
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            <p>
              {dirty ? "You have unsaved changes." : "Showing saved limits."} Saving applies both
              global and strategy limits immediately.
            </p>
            {t.riskStatus && (
              <p className="mt-1">
                Tracked entries today: {t.riskStatus.entriesToday} · Daily drawdown:{" "}
                {t.riskStatus.drawdownPct.toFixed(2)}% ({inr(t.riskStatus.drawdownAmount, 2)}).
                Entry tracking began{" "}
                {new Date(t.riskStatus.trackingStartedAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                IST; earlier entries are excluded.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !connected}
              className={`${btn} bg-slate-100`}
              onClick={() => {
                const next = makeDraft(t.risk, t.strategies);
                setDraft(next);
                setBaseline(JSON.stringify(next));
                setMessage(null);
              }}
            >
              Reset changes
            </button>
            <button
              type="submit"
              disabled={saving || !connected || !dirty}
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2`}
            >
              <Save className="w-4 h-4" />
              {saving
                ? "Saving…"
                : message?.ok && message.message.startsWith("Risk limits saved") && !dirty
                  ? "Saved"
                  : "Save risk limits"}
            </button>
          </div>
        </div>
      </Panel>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-xl p-4 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
        >
          {message.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs text-slate-500">
          <strong className="text-slate-800">Kill switch: {t.killed ? "Engaged" : "Off"}</strong>
          <p className="mt-1">
            Blocks new entries; protective exits remain active. Releasing it does not bypass a
            breached risk limit.
          </p>
        </div>
        <button
          type="button"
          disabled={!connected || controlBusy || saving}
          className={`${btn} ${t.killed ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-600"}`}
          onClick={async () => {
            setControlBusy(true);
            try {
              setMessage(await t.toggleKill());
            } finally {
              setControlBusy(false);
            }
          }}
        >
          {controlBusy ? "Updating…" : t.killed ? "Release kill switch" : "Block new entries"}
        </button>
      </div>
    </form>
  );
}
