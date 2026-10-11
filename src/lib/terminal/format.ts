export const inr = (n: number, dp = 0) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;

export const signed = (n: number, dp = 0) => `${n > 0 ? "+" : ""}${inr(n, dp)}`;

export const pnlColor = (n: number) =>
  n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-600" : "text-slate-500";

export const num = (n: number, dp = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
