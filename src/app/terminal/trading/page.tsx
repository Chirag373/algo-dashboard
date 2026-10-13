"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart3,
  FunctionSquare,
  Maximize2,
  Minus,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useTerminal, pnlOf } from "@/lib/terminal/store";
import { inr, num, pnlColor, signed } from "@/lib/terminal/format";
import { Empty, Select } from "@/components/terminal";
import type { Side } from "@/lib/terminal/types";
import { LightweightChart } from "@/components/terminal";

const card = "bg-white border border-slate-200 shadow-sm rounded-xl";
const field =
  "w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500";
const label = "block text-[11px] font-medium text-slate-500 mb-1";

const DEFAULT_WATCHLIST = [
  "NIFTY 50",
  "BANKNIFTY",
  "FINNIFTY",
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "SBIN",
  "TATAMOTORS",
];

const ALL_POPULAR_STOCKS = [
  { symbol: "NIFTY 50", name: "Nifty 50 Index", exchange: "NSE" },
  { symbol: "BANKNIFTY", name: "Nifty Bank Index", exchange: "NSE" },
  { symbol: "FINNIFTY", name: "Nifty Financial Services", exchange: "NSE" },
  { symbol: "SENSEX", name: "BSE Sensex Index", exchange: "BSE" },
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", exchange: "NSE" },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE" },
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", exchange: "NSE" },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", exchange: "NSE" },
  { symbol: "ITC", name: "ITC Ltd", exchange: "NSE" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", exchange: "NSE" },
  { symbol: "LT", "name": "Larsen & Toubro Ltd", exchange: "NSE" },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", exchange: "NSE" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", exchange: "NSE" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", exchange: "NSE" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", exchange: "NSE" },
  { symbol: "TITAN", name: "Titan Company Ltd", exchange: "NSE" },
  { symbol: "WIPRO", name: "Wipro Ltd", exchange: "NSE" },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", exchange: "NSE" },
  { symbol: "POWERGRID", name: "Power Grid Corporation", exchange: "NSE" },
  { symbol: "NTPC", name: "NTPC Ltd", exchange: "NSE" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", exchange: "NSE" },
  { symbol: "ADANIENT", name: "Adani Enterprises", exchange: "NSE" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ", exchange: "NSE" },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd", exchange: "NSE" },
  { symbol: "HCLTECH", name: "HCL Technologies", exchange: "NSE" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv Ltd", exchange: "NSE" },
  { symbol: "NESTLEIND", name: "Nestle India Ltd", exchange: "NSE" },
  { symbol: "COALINDIA", name: "Coal India Ltd", exchange: "NSE" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", exchange: "NSE" },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd", exchange: "NSE" },
  { symbol: "TRENT", name: "Trent Ltd", exchange: "NSE" },
  { symbol: "BEL", name: "Bharat Electronics Ltd", exchange: "NSE" },
  { symbol: "HAL", name: "Hindustan Aeronautics", exchange: "NSE" },
  { symbol: "M&M", name: "Mahindra & Mahindra", exchange: "NSE" },
  { symbol: "TECHM", name: "Tech Mahindra Ltd", exchange: "NSE" },
  { symbol: "EICHERMOT", name: "Eicher Motors Ltd", exchange: "NSE" },
  { symbol: "CIPLA", name: "Cipla Ltd", exchange: "NSE" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", exchange: "NSE" },
];

interface QuoteData {
  ltp: number;
  chg: number;
  pct: number;
  high?: number;
  low?: number;
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

const WL_TABS = ["All", "Indices", "Equities"] as const;

function Watchlist({
  selected,
  onSelect,
  quotes,
  watchlist,
  onAddStock,
  onRemoveStock,
}: {
  selected: string;
  onSelect: (s: string) => void;
  quotes: Record<string, QuoteData>;
  watchlist: string[];
  onAddStock: (s: string) => void;
  onRemoveStock: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof WL_TABS)[number]>("All");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Filter existing watchlist by tab & query
  const filteredList = useMemo(() => {
    return watchlist.filter((s) => {
      const matchQ = s.toLowerCase().includes(q.toLowerCase());
      const isIndex = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"].some((idx) =>
        s.toUpperCase().includes(idx)
      );
      if (tab === "Indices") return matchQ && isIndex;
      if (tab === "Equities") return matchQ && !isIndex;
      return matchQ;
    });
  }, [watchlist, q, tab]);

  // Search candidate suggestions to ADD
  const searchSuggestions = useMemo(() => {
    if (!q.trim()) return [];
    const qLower = q.toLowerCase();
    return ALL_POPULAR_STOCKS.filter(
      (item) =>
        (item.symbol.toLowerCase().includes(qLower) ||
          item.name.toLowerCase().includes(qLower)) &&
        !watchlist.includes(item.symbol)
    ).slice(0, 8);
  }, [q, watchlist]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <section className={`${card} flex flex-col min-h-0 flex-1 relative`}>
      {/* Search Header */}
      <div className="p-3 relative z-30" ref={searchBoxRef}>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-500 focus-within:bg-white shadow-sm transition-all">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShowSearchDropdown(true);
            }}
            onFocus={() => setShowSearchDropdown(true)}
            placeholder="Search stock to add (e.g. RELIANCE, TCS)..."
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                setShowSearchDropdown(false);
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown to Add to Watchlist */}
        {showSearchDropdown && searchSuggestions.length > 0 && (
          <div className="absolute top-full left-3 right-3 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 divide-y divide-slate-100 max-h-60 overflow-y-auto animate-in fade-in">
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">
              Add to Watchlist
            </div>
            {searchSuggestions.map((item) => (
              <div
                key={item.symbol}
                className="px-3 py-2 flex items-center justify-between hover:bg-blue-50/60 transition-colors"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{item.symbol}</div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                    {item.name} · {item.exchange}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onAddStock(item.symbol);
                    setQ("");
                    setShowSearchDropdown(false);
                  }}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-sm transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
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

      {/* Watchlist Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full">
          <thead className="bg-slate-50/80 sticky top-0 z-10">
            <tr className="text-[11px] text-slate-500">
              <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
              <th className="px-3 py-1.5 text-right font-medium">LTP</th>
              <th className="px-3 py-1.5 text-right font-medium">Change %</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredList.map((s) => {
              const qData = quotes[s] || { ltp: 0, chg: 0, pct: 0 };
              const active = s === selected;
              return (
                <tr
                  key={s}
                  onClick={() => onSelect(s)}
                  className={`group cursor-pointer transition-colors ${
                    active ? "bg-blue-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Star
                        className={`w-3.5 h-3.5 shrink-0 ${
                          active ? "text-amber-400 fill-amber-400" : "text-slate-300"
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">{s}</div>
                        <div className="text-[10px] text-slate-400">NSE</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right mono-nums text-xs font-semibold text-slate-800">
                    {qData.ltp ? num(qData.ltp) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right mono-nums text-[11px]">
                    {qData.ltp ? (
                      <ChangeText chg={qData.chg} pct={qData.pct} />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="pr-2 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveStock(s);
                      }}
                      title={`Remove ${s} from watchlist`}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredList.length === 0 && (
          <div className="p-8 text-center">
            <Empty text="No stocks found in this tab" />
            <p className="text-[11px] text-slate-400 mt-1">Use the search box above to add stocks.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Order ticket */

function OrderTicket({
  symbol,
  onSymbol,
  quote,
  watchlist,
}: {
  symbol: string;
  onSymbol: (s: string) => void;
  quote: QuoteData;
  watchlist: string[];
}) {
  const t = useTerminal();
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
    <section className={`${card} shrink-0 relative z-30`}>
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
              searchable
              value={symbol}
              onChange={onSymbol}
              options={watchlist.map((s) => ({ value: s, label: s }))}
            />
            <div className="text-[10px] text-slate-400 mt-0.5">
              NSE · {product} · {symbol.includes("NIFTY") ? "Index" : "Equity"}
            </div>
          </div>
          <div className="text-right">
            <div className="mono-nums text-[13px] font-bold text-slate-900">
              {quote.ltp ? num(quote.ltp) : "—"}
            </div>
            {quote.ltp > 0 && (
              <ChangeText chg={quote.chg} pct={quote.pct} className="mono-nums text-[11px]" />
            )}
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

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "D"];

function ChartPanel({
  symbol,
  onSymbol,
  quote,
  watchlist,
}: {
  symbol: string;
  onSymbol: (s: string) => void;
  quote: QuoteData;
  watchlist: string[];
}) {
  const [tf, setTf] = useState("5m");

  return (
    <section className={`${card} flex flex-col min-h-0`} style={{ flex: 2.5, minHeight: "400px" }}>
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 p-1.5 rounded-lg">
            <BarChart3 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="relative">
            <Select
              variant="transparent"
              searchable
              value={symbol}
              onChange={onSymbol}
              options={watchlist.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <span className="mono-nums text-sm font-bold text-slate-900">
            {quote.ltp ? num(quote.ltp) : "—"}
          </span>
          {quote.ltp > 0 && (
            <ChangeText chg={quote.chg} pct={quote.pct} className="mono-nums text-xs font-semibold" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Real Market Data
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-md p-0.5 text-[11px] font-semibold">
          {TIMEFRAMES.map((k) => (
            <button
              key={k}
              onClick={() => setTf(k)}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                tf === k ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-slate-500 text-xs">
          {quote.high && (
            <span>
              High: <strong className="text-slate-800">{num(quote.high)}</strong>
            </span>
          )}
          {quote.low && (
            <span>
              Low: <strong className="text-slate-800">{num(quote.low)}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="px-2 pt-2 flex-1 min-h-0 flex flex-col">
        <div className="px-2 pb-1 text-[11px] text-slate-500 shrink-0">
          <span className="font-semibold text-slate-800">{symbol}</span> · {tf} · NSE Live Candles
        </div>
        <div className="flex-1 min-h-0">
          <LightweightChart key={`${symbol}-${tf}`} symbol={symbol} height={undefined} />
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
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [symbol, setSymbol] = useState("NIFTY 50");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});

  // Load custom watchlist from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("algo_user_watchlist");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWatchlist(parsed);
          setSymbol(parsed[0]);
        }
      }
    } catch {
      // fallback to default
    }
  }, []);

  // Save watchlist to localStorage whenever it changes
  const saveWatchlist = (updated: string[]) => {
    setWatchlist(updated);
    try {
      localStorage.setItem("algo_user_watchlist", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleAddStock = (s: string) => {
    if (!watchlist.includes(s)) {
      const updated = [s, ...watchlist];
      saveWatchlist(updated);
      setSymbol(s);
    }
  };

  const handleRemoveStock = (s: string) => {
    const updated = watchlist.filter((item) => item !== s);
    saveWatchlist(updated);
    if (symbol === s && updated.length > 0) {
      setSymbol(updated[0]);
    }
  };

  // Poll real-time quotes every 4 seconds for watchlist stocks
  useEffect(() => {
    let active = true;

    const fetchQuotes = async () => {
      if (watchlist.length === 0) return;
      try {
        const query = watchlist.slice(0, 15).join(",");
        const res = await fetch(`http://localhost:8001/api/v1/quotes?symbols=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.quotes) {
            setQuotes((prev) => ({ ...prev, ...data.quotes }));
          }
        }
      } catch {
        // ignore network error
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [watchlist]);

  const currentQuote = quotes[symbol] || { ltp: 0, chg: 0, pct: 0 };

  return (
    <div
      className="w-full flex-1 grid gap-4 min-h-0"
      style={{ gridTemplateColumns: "3fr 7fr", minHeight: "calc(100vh - 120px)" }}
    >
      {/* 30% column: Watchlist & Order Ticket */}
      <div className="flex flex-col gap-4 min-w-0 min-h-0 h-full">
        <Watchlist
          selected={symbol}
          onSelect={setSymbol}
          quotes={quotes}
          watchlist={watchlist}
          onAddStock={handleAddStock}
          onRemoveStock={handleRemoveStock}
        />
        <OrderTicket
          symbol={symbol}
          onSymbol={setSymbol}
          quote={currentQuote}
          watchlist={watchlist}
        />
      </div>

      {/* 70% column: Chart & Order Book */}
      <div className="flex flex-col gap-4 min-w-0 min-h-0 h-full">
        <ChartPanel
          symbol={symbol}
          onSymbol={setSymbol}
          quote={currentQuote}
          watchlist={watchlist}
        />
        <OrderBook />
      </div>
    </div>
  );
}
