"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const API = "http://localhost:8001/api/v1";

function KiteCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Exchanging token with Zerodha...");

  useEffect(() => {
    const requestToken = searchParams.get("request_token");
    const action = searchParams.get("action");
    const kiteStatus = searchParams.get("status");

    if (kiteStatus === "error" || action === "error") {
      setStatus("error");
      setMessage("Kite login was cancelled or failed. Please try again.");
      return;
    }

    if (!requestToken) {
      setStatus("error");
      setMessage("No request_token found in redirect URL. Please try logging in again.");
      return;
    }

    // Exchange request_token for access_token
    fetch(`${API}/kite/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_token: requestToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setStatus("success");
          setMessage("Kite connected successfully! Redirecting to backtest...");
          setTimeout(() => router.push("/terminal/backtest"), 2000);
        } else {
          throw new Error(data.detail || "Failed to get access token");
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message || "Failed to exchange token. Please try again.");
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-10 max-w-md w-full text-center space-y-5">
        {/* Kite logo */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#e8401a] flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-bold text-slate-800 text-lg">Kite Connect</span>
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">Connecting to Kite...</h2>
            <p className="text-sm text-slate-500">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">Connected Successfully!</h2>
            <p className="text-sm text-slate-500">{message}</p>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: "100%" }} />
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">Connection Failed</h2>
            <p className="text-sm text-slate-500 mb-4">{message}</p>

            <div className="space-y-2">
              <p className="text-xs text-slate-400 font-medium">Try logging in again:</p>
              <a
                href="https://kite.zerodha.com/connect/login?api_key=ovioop7ol8h3p4tr&v=3"
                className="block w-full px-4 py-2.5 bg-[#e8401a] hover:bg-[#c93515] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Login with Kite
              </a>
              <button
                onClick={() => router.push("/terminal/backtest")}
                className="block w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
              >
                Back to Backtest
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function KiteCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <KiteCallbackInner />
    </Suspense>
  );
}
