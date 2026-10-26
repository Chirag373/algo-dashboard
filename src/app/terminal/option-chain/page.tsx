"use client";

import { Wifi, Key, ExternalLink } from "lucide-react";
import { Select } from "@/components/terminal/ui";
import { useEffect, useState } from "react";
import { api } from "@/utils/api";
import styles from "./option-chain.module.css";

interface Contract {
  symbol: string;
  lotSize: number;
  ltp: number | null;
  oi: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: string | null;
}
interface Chain {
  spot: number | null;
  atmStrike: number | null;
  symbol: string;
  expiry: string;
  expiries: string[];
  underlyings: string[];
  rows: { strike: number; call: Contract | null; put: Contract | null }[];
  missingQuotes: number;
  updatedAt: string;
}
const REFRESH_MS = 3000;

function priceChange(value: number | null | undefined, previous: number | null | undefined) {
  if (value == null || previous == null || value === previous) return "";
  return value > previous ? styles.priceUp : styles.priceDown;
}

const format = (value: number | null | undefined, decimals = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

export default function OptionChain() {
  const [kiteConnected, setKiteConnected] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);
  const [symbol, setSymbol] = useState("NIFTY");
  const [expiry, setExpiry] = useState("");
  const [response, setResponse] = useState<{
    key: string;
    data: Chain;
    previous: Chain | null;
  } | null>(null);
  const [options, setOptions] = useState<string[]>(["NIFTY"]);
  const [optionsError, setOptionsError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api<{ connected: boolean }>("GET", "/kite/status")
        .then((data) => {
          if (active) {
            setKiteConnected(data.connected);
            if (data.connected) setRetry((n) => n + 1);
          }
        })
        .catch(() => {
          if (active) setKiteConnected(false);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    void api<{ login_url: string }>("GET", "/kite/login-url")
      .then((data) => {
        if (active) setLoginUrl(data.login_url);
      })
      .catch(() => {});
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const handleSaveToken = async () => {
    if (!accessToken.trim()) return;
    setTokenSaving(true);
    setError("");
    try {
      await api("POST", "/kite/set-token", { access_token: accessToken.trim() });
      const status = await api<{ connected: boolean }>("GET", "/kite/status");
      setKiteConnected(status.connected);
      if (!status.connected)
        throw new Error("Kite rejected this token. Please reconnect with a valid session.");
      setAccessToken("");
      setShowTokenInput(false);
      setRetry((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect Kite");
    } finally {
      setTokenSaving(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    api<{ underlyings: string[] }>("GET", "/kite/option-underlyings", undefined, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setOptions(result.underlyings);
          setOptionsError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setOptionsError(e instanceof Error ? e.message : "Unable to load option underlyings");
      });
    return () => controller.abort();
  }, [kiteConnected, retry]);
  const key = `${symbol}:${expiry}`;
  const data = response?.key === key ? response.data : null;
  const previous = response?.key === key ? response.previous : null;
  const previousContracts = new Map(
    previous?.rows
      .flatMap((row) => [row.call, row.put])
      .filter((contract): contract is Contract => contract !== null)
      .map((contract) => [contract.symbol, contract]) ?? []
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ symbol });
        if (expiry) params.set("expiry", expiry);
        const result = await api<Chain>("GET", `/kite/option-chain?${params}`, undefined, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (controller.signal.aborted) return;
        setKiteConnected(true);
        setResponse((current) => ({
          key,
          data: result,
          previous:
            current?.key === key && current.data.expiry === result.expiry ? current.data : null,
        }));
        setError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Unable to load option chain");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, REFRESH_MS);
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [symbol, expiry, key, retry]);
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-8 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Option Chain</h1>
          <p className="mt-1 text-sm text-slate-500">
            Zerodha market quotes · Refreshes every 3 seconds
          </p>
        </div>
        {kiteConnected ? (
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            <Wifi className="w-3.5 h-3.5 text-slate-500" />
            Kite Connected
          </div>
        ) : (
          <button
            onClick={() => setShowTokenInput(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200/80 transition-colors"
            title="Connect Kite for option-chain data"
          >
            <Wifi className="w-3.5 h-3.5 text-slate-500" />
            Connect Kite
          </button>
        )}
      </div>
      {/* Kite Login Panel */}
      {showTokenInput && (
        <div className="bg-blue-50/80 rounded-2xl p-5 space-y-3 shadow-xs border border-blue-100">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-blue-900 text-sm">Connect Zerodha Kite</span>
          </div>
          <p className="text-xs text-blue-800">
            Click the button below to log in with your Zerodha account. It will automatically
            redirect and connect your session:
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href={loginUrl || undefined}
              onClick={() => sessionStorage.setItem("kiteReturnTo", "/terminal/option-chain")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#e8401a] hover:bg-[#c93515] text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Zerodha Login
            </a>
            <span className="text-[11px] text-slate-500">or paste token manually:</span>
          </div>
          <div className="flex gap-2.5 mt-1">
            <input
              type="password"
              placeholder="Paste your Kite access_token here..."
              className="flex-1 text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white border border-slate-200"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <button
              onClick={handleSaveToken}
              disabled={!accessToken.trim() || tokenSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              {tokenSaving ? "Saving..." : "Connect"}
            </button>
            <button
              onClick={() => setShowTokenInput(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-xs text-slate-500">
          Underlying
          <Select
            aria-label="Option underlying"
            searchable
            className="w-80 min-w-80"
            value={symbol}
            onChange={(value) => {
              setSymbol(value);
              setExpiry("");
              setResponse(null);
              setError("");
            }}
            options={options.map((s) => ({ value: s, label: s }))}
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Expiry
          <Select
            aria-label="Option expiry"
            className="w-80 min-w-80"
            value={expiry || data?.expiry || ""}
            disabled={!data}
            onChange={(value) => {
              setExpiry(value);
              setError("");
            }}
            options={
              data
                ? data.expiries.map((d) => ({ value: d, label: d }))
                : [{ value: "", label: "Nearest expiry" }]
            }
          />
        </label>
        <button
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => setRetry((n) => n + 1)}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        {data && (
          <p className="pb-2 text-xs text-slate-500">
            Fetched{" "}
            {new Date(data.updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            · Spot{" "}
            <span key={data.spot} className={priceChange(data.spot, previous?.spot)}>
              {format(data.spot, 2)}
            </span>{" "}
            · {data.rows.length} strikes{" "}
            {data.atmStrike !== null
              ? "(up to 20 below / 20 above ATM)"
              : "(spot unavailable; showing available strikes)"}
          </p>
        )}
      </div>
      {optionsError && optionsError !== error && (
        <p role="alert" className="text-sm text-amber-700">
          {optionsError}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error}
          {data && " Displaying the last successful snapshot."}
        </div>
      )}
      {!data && !error && (
        <p role="status" className="p-8 text-center text-slate-500">
          Loading Zerodha option contracts and quotes…
        </p>
      )}
      {data && (
        <>
          {data.missingQuotes > 0 && (
            <p className="text-xs text-amber-700">
              Quotes unavailable for {data.missingQuotes} contracts. Missing values are shown as —.
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full whitespace-nowrap text-right text-xs">
              <thead>
                <tr>
                  <th colSpan={5} className="bg-emerald-50 p-3 text-center text-emerald-800">
                    CALLS (CE)
                  </th>
                  <th className="bg-slate-100 p-3 text-center">Strike</th>
                  <th colSpan={5} className="bg-rose-50 p-3 text-center text-rose-800">
                    PUTS (PE)
                  </th>
                </tr>
                <tr className="border-b bg-slate-50 text-slate-500">
                  {[
                    "OI",
                    "Volume",
                    "Bid",
                    "Ask",
                    "LTP",
                    "Price",
                    "LTP",
                    "Bid",
                    "Ask",
                    "Volume",
                    "OI",
                  ].map((name, i) => (
                    <th key={i} className="px-4 py-3">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr
                    key={row.strike}
                    className={
                      row.strike === data.atmStrike
                        ? "bg-blue-50 font-semibold"
                        : "hover:bg-slate-50"
                    }
                  >
                    {[
                      row.call?.oi,
                      row.call?.volume,
                      row.call?.bid,
                      row.call?.ask,
                      row.call?.ltp,
                    ].map((v, i) => (
                      <td
                        key={`c${i}:${v ?? "missing"}`}
                        className={`px-4 py-3 ${i > 1 ? priceChange(v, row.call ? previousContracts.get(row.call.symbol)?.[(["bid", "ask", "ltp"] as const)[i - 2]] : null) : ""}`}
                        title={
                          row.call
                            ? `${row.call.symbol} · Lot ${row.call.lotSize} · Quote ${row.call.timestamp ?? "unavailable"}`
                            : "No contract"
                        }
                      >
                        {format(v, i > 1 ? 2 : 0)}
                      </td>
                    ))}
                    <td className="bg-slate-50 px-4 py-3 text-center font-bold">
                      {format(row.strike, 2)}
                      {row.strike === data.atmStrike && (
                        <span className="ml-2 text-[10px] text-blue-600">ATM</span>
                      )}
                    </td>
                    {[row.put?.ltp, row.put?.bid, row.put?.ask, row.put?.volume, row.put?.oi].map(
                      (v, i) => (
                        <td
                          key={`p${i}:${v ?? "missing"}`}
                          className={`px-4 py-3 ${i < 3 ? priceChange(v, row.put ? previousContracts.get(row.put.symbol)?.[(["ltp", "bid", "ask"] as const)[i]] : null) : ""}`}
                          title={
                            row.put
                              ? `${row.put.symbol} · Lot ${row.put.lotSize} · Quote ${row.put.timestamp ?? "unavailable"}`
                              : "No contract"
                          }
                        >
                          {format(v, i < 3 ? 2 : 0)}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Price increases flash green; decreases flash red. Unchanged prices are neutral. Prices
            and OI are exchange snapshots; outside trading hours they reflect the last available
            quote. OI and volume are shown as returned by Zerodha.
          </p>
        </>
      )}
    </div>
  );
}
