export { formatPercent as fmtPct } from "@/lib/format";

// "2026-09-09" → "Sep 9". No year: the record spans one competition season.
export function fmtDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Whole dollars — a $100k paper account doesn't need cents.
export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
