"use client";

import { useState } from "react";
import {
  BarChart3,
  FunctionSquare,
  Maximize2,
  Minus,
  MoreVertical,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { useTerminal, pnlOf } from "@/lib/terminal/store";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";
import { PRICE_BOOK, SYMBOLS } from "@/lib/terminal/mock";
import { Empty, Select } from "@/components/terminal";
import type { Side } from "@/lib/terminal/types";
import { LightweightChart } from "@/components/terminal";

const card = "bg-white border border-slate-100 shadow-sm rounded-xl overflow-hidden";
const field =
  "w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500";
const label = "block text-[11px] font-medium text-slate-500 mb-1";

function useQuote(symbol: string) {
  const t = useTerminal();
  const ltp = t.prices[symbol] ?? 0;
  const base = PRICE_BOOK[symbol] ?? ltp;
  const chg = ltp && base ? ltp - base : 0;
  const pct = base ? (chg / base) * 100 : 0;
  return { ltp, chg, pct };
}

function ChangeText({
  chg,
  pct,
  className = "",
}: {
  chg: number;
  pct: number;
  className?: string;
}) {
  return (
    <span className={`${pnlColor(chg)} ${className}`}>
      {chg >= 0 ? "+" : ""}
      {num(chg)} ({pct >= 0 ? "+" : ""}
      {pct.toFixed(2)}%)
    </span>
  );
}

/* ----------------------------------------------------------------- Watchlist */

const WL_TABS = ["Watchlist", "Futures", "Equity"] as const;

function WatchRow({ s, active, onSelect }: { s: string; active: boolean; onSelect: () => void }) {
  const q = useQuote(s);
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer ${active ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
    >
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Star
            className={`w-3.5 h-3.5 ${active ? "text-amber-400 fill-amber-400" : "text-slate-300"}`}
          />
          <div>
            <div className="text-xs font-semibold text-slate-900">{s}</div>
            <div className="text-[10px] text-slate-400">NSE</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-1.5 text-right mono-nums text-xs text-slate-800">{num(q.ltp)}</td>
      <td className="px-3 py-1.5 text-right mono-nums text-[11px]">
        <ChangeText chg={q.chg} pct={q.pct} />
      </td>
      <td className="pr-2 py-1.5 text-right">
        <MoreVertical className="w-3.5 h-3.5 text-slate-400 inline" />
      </td>
    </tr>
  );
}

function Watchlist({ selected, onSelect }: { selected: string; onSelect: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof WL_TABS)[number]>("Watchlist");
  const list = SYMBOLS.filter((s) => s.toLowerCase().includes(q.toLowerCase())).filter((s) =>
    tab === "Futures" ? s.endsWith("FUT") : tab === "Equity" ? !s.endsWith("FUT") : true
  );

  return (
    <section className={`${card} flex flex-col min-h-0 flex-1`}>
      <div className="p-3 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol (e.g. NIFTY, RELIANCE)"
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <button className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 flex gap-4 border-b border-slate-100 text-xs font-semibold shrink-0">
        {WL_TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-1.5 relative transition-colors ${
              tab === k ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {k}
            {tab === k && (
              <span className="absolute left-0 right-0 -bottom-[1px] h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full">
          <thead className="bg-slate-50/80 sticky top-0">
            <tr className="text-[11px] text-slate-500">
              <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
              <th className="px-3 py-1.5 text-right font-medium">LTP</th>
              <th className="px-3 py-1.5 text-right font-medium">Change %</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {list.map((s) => (
              <WatchRow key={s} s={s} active={s === selected} onSelect={() => onSelect(s)} />
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty text="No symbols match" />}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Order ticket */

function OrderTicket({ symbol, onSymbol }: { symbol: string; onSymbol: (s: string) => void }) {
  const t = useTerminal();
  const quote = useQuote(symbol);
  const [side, setSide] = useState<Side>("BUY");
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [price, setPrice] = useState("");
  const [product, setProduct] = useState("MIS");
  const [validity, setValidity] = useState("DAY");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const execPrice = type === "LIMIT" && Number(price) > 0 ? Number(price) : quote.ltp;
  const margin = execPrice * qty;

  const submit = async () => {
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
    <section className={`${card} shrink-0`}>
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-800">Order Ticket</h3>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-600">
          {t.mode}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="relative">
            <Select
              variant="transparent"
              value={symbol}
              onChange={onSymbol}
              options={SYMBOLS.map((s) => ({ value: s, label: s }))}
            />
            <div className="text-[10px] text-slate-400 mt-0.5">
              NSE · {product} · {symbol.endsWith("FUT") ? "Future" : "Equity"}
            </div>
          </div>
          <div className="text-right">
            <div className="mono-nums text-[13px] font-bold text-slate-900">{num(quote.ltp)}</div>
            <ChangeText chg={quote.chg} pct={quote.pct} className="mono-nums text-[11px]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-md text-xs font-semibold">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`py-1.5 rounded transition-colors ${
                side === s
                  ? s === "BUY"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Quantity</span>
            <div className="flex items-center border border-slate-200 rounded-md">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                className="w-full min-w-0 bg-transparent px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
              />
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-1.5 text-slate-500 hover:text-slate-900"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="px-1.5 text-slate-500 hover:text-slate-900"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div>
            <span className={label}>Order Type</span>
            <Select
              size="sm"
              value={type}
              onChange={(val) => setType(val as "MARKET" | "LIMIT")}
              options={[
                { value: "MARKET", label: "Market" },
                { value: "LIMIT", label: "Limit" },
              ]}
            />
          </div>
          <div>
            <span className={label}>Product</span>
            <Select
              size="sm"
              value={product}
              onChange={setProduct}
              options={[
                { value: "MIS", label: "MIS" },
                { value: "NRML", label: "NRML" },
              ]}
            />
          </div>
          <div>
            <span className={label}>Validity</span>
            <Select
              size="sm"
              value={validity}
              onChange={setValidity}
              options={[
                { value: "DAY", label: "Day" },
                { value: "IOC", label: "IOC" },
              ]}
            />
          </div>
          {type === "LIMIT" && (
            <div className="col-span-2">
              <span className={label}>Limit Price</span>
              <input
                type="number"
                className={field}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="bg-slate-50 rounded-md px-3 py-2 grid grid-cols-2 text-[11px]">
          <div>
            <div className="text-slate-500">Approx. Required Margin</div>
            <div className="mono-nums font-semibold text-slate-900">{inr(margin)}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-500">Available Balance</div>
            <div className="mono-nums font-semibold text-slate-900">{inr(t.risk.totalCapital)}</div>
          </div>
        </div>

        <button
          disabled={t.killed || busy}
          onClick={submit}
          className={`w-full py-2 rounded-md text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === "BUY" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
          }`}
        >
          {side === "BUY" ? "Buy" : "Sell"} {qty} Qty ({type === "MARKET" ? "Market" : "Limit"})
        </button>

        {msg && (
          <p className={`text-[11px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- Chart */

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "D", "W", "M"];

function ChartPanel({ symbol, onSymbol }: { symbol: string; onSymbol: (s: string) => void }) {
  const quote = useQuote(symbol);
  const [tf, setTf] = useState("1m");

  return (
    <section className={`${card} flex flex-col min-h-0`} style={{ flex: 2.5, minHeight: "380px" }}>
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <div className="bg-blue-50 p-1 rounded-md">
          <BarChart3 className="w-4 h-4 text-blue-600" />
        </div>
        <div className="relative">
          <Select
            variant="transparent"
            value={symbol}
            onChange={onSymbol}
            options={SYMBOLS.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <span className="mono-nums text-xs font-semibold text-slate-800">{num(quote.ltp)}</span>
        <ChangeText chg={quote.chg} pct={quote.pct} className="mono-nums text-xs font-semibold" />
      </div>

      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex gap-0.5 bg-slate-50 rounded-md p-0.5 text-[11px] font-semibold">
          {TIMEFRAMES.map((k) => (
            <button
              key={k}
              onClick={() => setTf(k)}
              className={`px-2.5 py-0.5 rounded ${tf === k ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <button className="flex items-center gap-1 text-[11px] font-semibold hover:text-slate-900">
            <FunctionSquare className="w-3.5 h-3.5" /> Indicators
          </button>
          <button className="hover:text-slate-900">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-slate-900">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-2 pt-2 flex-1 min-h-0 flex flex-col">
        <div className="px-2 pb-1 text-[11px] text-slate-500 shrink-0">
          <span className="font-semibold text-slate-700">{symbol}</span> · {tf} · NSE
        </div>
        <div className="flex-1 min-h-0">
          <LightweightChart key={symbol} symbol={symbol} height={undefined} />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Order book */

type BookTab = "positions" | "orders" | "trades";

function OrderBook() {
  const t = useTerminal();
  const [tab, setTab] = useState<BookTab>("positions");
  const tabs: { k: BookTab; label: string; n: number }[] = [
    { k: "positions", label: "Positions", n: t.positions.length },
    { k: "orders", label: "Orders", n: t.orders.length },
    { k: "trades", label: "Closed Trades", n: t.closed.length },
  ];

  return (
    <section className={`${card} flex flex-col min-h-0`} style={{ flex: 1, minHeight: "220px" }}>
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-5 text-xs font-semibold">
          {tabs.map(({ k, label: l, n }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`relative py-0.5 transition-colors ${
                tab === k ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {l} ({n})
              {tab === k && (
                <span className="absolute left-0 right-0 -bottom-[11px] h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tab === "positions" ? (
            <button
              disabled={t.positions.length === 0}
              onClick={t.squareOffAll}
              className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md text-[11px] font-semibold transition-colors"
            >
              Square off all
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "positions" &&
          (t.positions.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Side</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Qty</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Avg</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">LTP</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">P&amp;L</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {t.positions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{p.symbol}</td>
                    <td className="px-3 py-2">{p.side}</td>
                    <td className="px-3 py-2 text-right">{p.qty}</td>
                    <td className="px-3 py-2 text-right">{num(p.avg)}</td>
                    <td className="px-3 py-2 text-right">{num(p.ltp)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${pnlColor(pnlOf(p))}`}>
                      {signed(pnlOf(p))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => t.closePosition(p.id)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded"
                      >
                        Exit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === "orders" &&
          (t.orders.length === 0 ? (
            <Empty text="No open orders" />
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Side</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Type</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Qty</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Price</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {t.orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{o.symbol}</td>
                    <td className="px-3 py-2">{o.side}</td>
                    <td className="px-3 py-2">{o.type}</td>
                    <td className="px-3 py-2 text-right">{o.qty}</td>
                    <td className="px-3 py-2 text-right">{num(o.price)}</td>
                    <td className="px-3 py-2">{o.status}</td>
                    <td className="px-3 py-2 text-right">
                      {o.status === "OPEN" && (
                        <button
                          onClick={() => t.cancelOrder(o.id)}
                          className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium rounded"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === "trades" &&
          (t.closed.length === 0 ? (
            <Empty text="No closed trades yet" />
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Side</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Qty</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Entry</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Exit</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {t.closed.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{c.symbol}</td>
                    <td className="px-3 py-2">{c.side}</td>
                    <td className="px-3 py-2 text-right">{c.qty}</td>
                    <td className="px-3 py-2 text-right">{num(c.entry)}</td>
                    <td className="px-3 py-2 text-right">{num(c.exit)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${pnlColor(c.pnl)}`}>
                      {signed(c.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- Page */

export default function Trading() {
  const [symbol, setSymbol] = useState(SYMBOLS[0]);

  return (
    <div
      className="w-full flex-1 grid gap-4 min-h-0"
      style={{ gridTemplateColumns: "3fr 7fr", minHeight: "calc(100vh - 120px)" }}
    >
      {/* 30% column: Watchlist & Order Ticket */}
      <div className="flex flex-col gap-4 min-w-0 min-h-0 h-full">
        <Watchlist selected={symbol} onSelect={setSymbol} />
        <OrderTicket symbol={symbol} onSymbol={setSymbol} />
      </div>

      {/* 70% column: Chart & Order Book */}
      <div className="flex flex-col gap-4 min-w-0 min-h-0 h-full">
        <ChartPanel symbol={symbol} onSymbol={setSymbol} />
        <OrderBook />
      </div>
    </div>
  );
}
