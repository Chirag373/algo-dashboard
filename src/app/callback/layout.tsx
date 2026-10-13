import { Suspense } from "react";
import KiteCallback from "./page";

export default function CallbackLayout() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-slate-500 text-sm">Connecting to Kite...</div>
        </div>
      }
    >
      <KiteCallback />
    </Suspense>
  );
}
