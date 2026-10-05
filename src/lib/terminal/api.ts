const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001/api/v1";

export const WS_URL =
  process.env.NEXT_PUBLIC_TERMINAL_WS_URL ??
  `${API_BASE.replace(/^http/, "ws").replace(/\/api\/v1\/?$/, "")}/ws/terminal`;

export class ApiError extends Error {}

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string; loc?: (string | number)[] }) => {
        const field = d.loc?.filter((x) => x !== "body").slice(-1)[0];
        const msg = (d.msg ?? "Invalid value").replace(/^Value error, /, "");
        return field && !msg.includes(String(field)) ? `${field}: ${msg}` : msg;
      })
      .join("; ");
  }
  return "Request failed";
}

export async function api<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the backend. Is it running on port 8001?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(describe((data as { detail?: unknown }).detail));
  return data as T;
}
