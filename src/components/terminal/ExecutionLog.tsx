"use client";

import { useEffect, useState } from "react";
import { api } from "@/utils/api";

interface Event {
  id: number;
  timestamp: string;
  kind: string;
  data: Record<string, unknown>;
}

export function ExecutionLog({ strategyId }: { strategyId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api<{ logs: Event[] }>(
          "GET",
          `/strategies/${strategyId}/logs?limit=30`
        );
        if (active) {
          setEvents(result.logs);
          setError("");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load logs");
      }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [strategyId]);
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <summary className="cursor-pointer font-semibold">
        Execution log · evaluations, signals, entries, exits and errors
      </summary>
      {error && (
        <p className="mt-2 text-rose-600" role="alert">
          {error}
        </p>
      )}
      <div className="max-h-64 overflow-auto mt-2 space-y-2">
        {!events.length && <p>Waiting for an evaluation on fresh, completed candles.</p>}
        {events.map((event) => (
          <div key={event.id} className="border-t border-slate-100 pt-2">
            <strong>{event.kind}</strong> · {new Date(event.timestamp).toLocaleString()}
            <pre className="whitespace-pre-wrap break-all text-slate-500 mt-1">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
