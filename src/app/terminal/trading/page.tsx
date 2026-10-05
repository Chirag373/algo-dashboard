"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTerminal, pnlOf } from "@/lib/terminal/store";
import { num, pnlColor, signed } from "@/lib/terminal/format";
import { SYMBOLS, strategyName } from "@/lib/terminal/mock";
import { Badge, Empty, Panel, btn, inputCls, td, tdr, th, thr } from "@/components/terminal/ui";
import type { Side } from "@/lib/terminal/types";
import { LightweightChart } from "@/components/terminal/LightweightChart";

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function OrderTicket() {
  const t = useTerminal();
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [busy, setBusy] = useState(false);

  const submit = async (side: Side) => {
    if (busy) return;
    setBusy(true);
    const r = await t.placeOrder({
      symbol,
      side,
      qty,
      type,
      price: type === "LIMIT" ? Number(price) : undefined,
    });
    setMsg({ ok: r.ok, text: r.message });
    setBusy(false);
  };

  return (
    <Panel title={`Order ticket (${t.mode})`}>
      <div className="p-4 space-y-3">
        <label className="block text-xs text-slate-400 space-y-1">
          Symbol
          <select className={inputCls} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="text-xs text-slate-500">
          LTP{" "}
          <span className="mono-nums text-white font-semibold">{num(t.prices[symbol] ?? 0)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-slate-400 space-y-1">
            Quantity
            <input
              type="number"
              min={1}
              className={inputCls}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            />
          </label>
          <label className="block text-xs text-slate-400 space-y-1">
            Type
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as "MARKET" | "LIMIT")}
            >
              <option>MARKET</option>
              <option>LIMIT</option>
            </select>
          </label>
        </div>
        {type === "LIMIT" && (
          <label className="block text-xs text-slate-400 space-y-1">
            Limit price
            <input
              type="number"
              className={inputCls}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled={t.killed}
            onClick={() => submit("BUY")}
            className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white py-2.5`}
          >
            BUY
          </button>
          <button
            disabled={t.killed}
            onClick={() => submit("SELL")}
            className={`${btn} bg-rose-600 hover:bg-rose-500 text-white py-2.5`}
          >
            SELL
          </button>
        </div>
        {msg && (
          <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>
        )}
        <p className="text-[11px] text-slate-500">
          All orders pass the risk checks (kill switch, max positions, max capital per trade).
          Default SL is 2% and target 4% in this demo.
        </p>
      </div>
    </Panel>
  );
}

export default function Trading() {
  const t = useTerminal();
  const [tab, setTab] = useState<"orders" | "trades">("orders");

  return (
    <div className="max-w-[1600px] mx-auto grid xl:grid-cols-4 gap-4">
      <div className="space-y-4">
        <OrderTicket />
        <Panel title="Watchlist">
          <ul className="divide-y divide-slate-800/70 text-sm">
            {SYMBOLS.map((s) => (
              <li key={s} className="px-4 py-2 flex justify-between">
                <span className="text-slate-300">{s}</span>
                <span className="mono-nums text-white">{num(t.prices[s] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="xl:col-span-3 space-y-4">
        <Panel title="NIFTY FUT Chart" noPadding>
          <LightweightChart symbol="NIFTY FUT" />
        </Panel>

        <Panel
          title={`Positions (${t.positions.length})`}
          right={
            <button
              disabled={t.positions.length === 0}
              onClick={t.squareOffAll}
              className={`${btn} bg-rose-700 hover:bg-rose-600 text-white`}
            >
              Square off all
            </button>
          }
        >
          {t.positions.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-[#0a0e17]">
                  <tr>
                    <th className={th}>Symbol</th>
                    <th className={th}>Strategy</th>
                    <th className={th}>Side</th>
                    <th className={thr}>Qty</th>
                    <th className={thr}>Avg</th>
                    <th className={thr}>LTP</th>
                    <th className={thr}>SL</th>
                    <th className={thr}>Target</th>
                    <th className={thr}>P&amp;L</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {t.positions.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className={`${td} font-semibold text-white`}>{p.symbol}</td>
                      <td className={`${td} text-slate-400`}>
                        {strategyName(p.strategyId, t.strategies)}
                      </td>
                      <td className={td}>
                        <Badge tone={p.side === "BUY" ? "green" : "red"}>{p.side}</Badge>
                      </td>
                      <td className={tdr}>{p.qty}</td>
                      <td className={tdr}>{num(p.avg)}</td>
                      <td className={tdr}>{num(p.ltp)}</td>
                      <td className={`${tdr} text-rose-400`}>{num(p.sl)}</td>
                      <td className={`${tdr} text-emerald-400`}>{num(p.target)}</td>
                      <td className={`${tdr} font-bold ${pnlColor(pnlOf(p))}`}>
                        {signed(pnlOf(p))}
                      </td>
                      <td className={td}>
                        <button
                          onClick={() => t.closePosition(p.id)}
                          className={`${btn} bg-slate-700 hover:bg-slate-600 text-white`}
                        >
                          Exit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title={
            tab === "orders" ? `Orders (${t.orders.length})` : `Closed trades (${t.closed.length})`
          }
          right={
            <div className="flex items-center gap-2">
              <div className="flex rounded-md overflow-hidden border border-slate-700 text-xs">
                {(["orders", "trades"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`px-3 py-1.5 capitalize ${tab === k ? "bg-slate-700 text-white" : "text-slate-400"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <button
                className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1`}
                onClick={() =>
                  tab === "orders"
                    ? downloadCsv("orders.csv", [
                        ["time", "symbol", "side", "type", "qty", "price", "status", "note"],
                        ...t.orders.map((o) => [
                          o.time,
                          o.symbol,
                          o.side,
                          o.type,
                          o.qty,
                          o.price,
                          o.status,
                          o.note ?? "",
                        ]),
                      ])
                    : downloadCsv("trades.csv", [
                        ["time", "symbol", "side", "qty", "entry", "exit", "pnl", "reason"],
                        ...t.closed.map((c) => [
                          c.closedAt,
                          c.symbol,
                          c.side,
                          c.qty,
                          c.entry,
                          c.exit,
                          c.pnl,
                          c.reason,
                        ]),
                      ])
                }
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          }
        >
          {tab === "orders" ? (
            t.orders.length === 0 ? (
              <Empty text="No orders yet. Place one from the ticket." />
            ) : (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-[#0a0e17] sticky top-0">
                    <tr>
                      <th className={th}>Time</th>
                      <th className={th}>Symbol</th>
                      <th className={th}>Side</th>
                      <th className={th}>Type</th>
                      <th className={thr}>Qty</th>
                      <th className={thr}>Price</th>
                      <th className={th}>Status</th>
                      <th className={th}>Note</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {t.orders.map((o) => (
                      <tr key={o.id}>
                        <td className={`${td} mono-nums text-slate-400`}>{o.time}</td>
                        <td className={`${td} text-white`}>{o.symbol}</td>
                        <td className={td}>
                          <Badge tone={o.side === "BUY" ? "green" : "red"}>{o.side}</Badge>
                        </td>
                        <td className={`${td} text-slate-400`}>{o.type}</td>
                        <td className={tdr}>{o.qty}</td>
                        <td className={tdr}>{num(o.price)}</td>
                        <td className={td}>
                          <Badge
                            tone={
                              o.status === "COMPLETE"
                                ? "green"
                                : o.status === "REJECTED"
                                  ? "red"
                                  : o.status === "OPEN"
                                    ? "amber"
                                    : "slate"
                            }
                          >
                            {o.status}
                          </Badge>
                        </td>
                        <td
                          className={`${td} text-slate-500 text-xs truncate max-w-[150px]`}
                          title={o.note || undefined}
                        >
                          {o.note}
                        </td>
                        <td className={td}>
                          {o.status === "OPEN" && (
                            <button
                              onClick={() => t.cancelOrder(o.id)}
                              className={`${btn} bg-slate-700 hover:bg-rose-700 text-white text-xs`}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : t.closed.length === 0 ? (
            <Empty text="No closed trades yet" />
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-[#0a0e17] sticky top-0">
                  <tr>
                    <th className={th}>Time</th>
                    <th className={th}>Symbol</th>
                    <th className={th}>Side</th>
                    <th className={thr}>Qty</th>
                    <th className={thr}>Entry</th>
                    <th className={thr}>Exit</th>
                    <th className={thr}>P&amp;L</th>
                    <th className={th}>Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {t.closed.map((c) => (
                    <tr key={c.id}>
                      <td className={`${td} mono-nums text-slate-400`}>{c.closedAt}</td>
                      <td className={`${td} text-white`}>{c.symbol}</td>
                      <td className={td}>
                        <Badge tone={c.side === "BUY" ? "green" : "red"}>{c.side}</Badge>
                      </td>
                      <td className={tdr}>{c.qty}</td>
                      <td className={tdr}>{num(c.entry)}</td>
                      <td className={tdr}>{num(c.exit)}</td>
                      <td className={`${tdr} font-bold ${pnlColor(c.pnl)}`}>{signed(c.pnl)}</td>
                      <td className={`${td} text-slate-500 text-xs`}>{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
