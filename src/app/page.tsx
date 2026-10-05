"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function PasscodeScreen() {
  const [passcode, setPasscode] = useState("");
  const router = useRouter();

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, validate passcode here
    // Redirecting to the new terminal by default; legacy apps remain reachable by passcode
    if (passcode === "finbaba") {
      router.push("/finbaba/dashboard");
    } else if (passcode === "orb") {
      router.push("/orb/dashboard");
    } else {
      router.push("/terminal");
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-[#111111] border border-[#222222] rounded-xl shadow-2xl w-full max-w-sm p-8 text-center">
        <h1 className="text-3xl font-bold tracking-wider text-white mb-1">
          The Algo <span className="text-blue-500">Trader</span>
        </h1>
        <p className="text-xs text-gray-500 tracking-widest mb-8 uppercase">Terminal Access</p>

        <form onSubmit={handleUnlock} className="space-y-6">
          <div className="space-y-2 text-left">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
              Enter Passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#333333] rounded-lg px-4 py-3 text-white text-center tracking-[0.5em] font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Lock className="w-4 h-4" />
            UNLOCK
          </button>
        </form>
      </div>
    </div>
  );
}
