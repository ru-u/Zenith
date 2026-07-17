// FINRA daily short-sale volume — free, keyless, published after each session at
// cdn.finra.org (pipe-delimited: Date|Symbol|ShortVolume|ShortExemptVolume|
// TotalVolume|Market). Short volume / total volume is a short-pressure signal
// (captured per thesis for the September re-fit, not scored). At ~3:30 drop
// time today's file doesn't exist yet, so this fetches the PRIOR trading day's
// file — yesterday's short pressure as context for today's spike. Same
// resilience posture as technicals.ts: any failure degrades to an empty map.

import { withRetry } from "../retry";
import { tradingDaysAgoKey } from "../market-calendar";

const REQUEST_TIMEOUT_MS = 15_000; // the consolidated file is a few MB

function fileUrl(dateKey: string): string {
  return `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${dateKey.replaceAll("-", "")}.txt`;
}

async function fetchFile(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`finra returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Prior-session short-volume ratio (ShortVolume / TotalVolume, 0..1) for a
 * small ticker list, keyed by symbol. Empty map on any failure.
 */
export async function fetchShortVolumeRatios(
  tickers: string[],
  dateKey: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (tickers.length === 0) return out;

  const [y, m, d] = dateKey.split("-").map(Number);
  const prevKey = tradingDaysAgoKey(2, new Date(Date.UTC(y, m - 1, d, 12)));
  if (prevKey === dateKey) return out;

  try {
    const text = await withRetry(() => fetchFile(fileUrl(prevKey)), {
      onRetry: (err, attempt, delay) =>
        console.warn(
          `[finra] retry ${attempt} in ${Math.round(delay)}ms:`,
          (err as Error)?.message,
        ),
    });
    const want = new Set(tickers);
    for (const line of text.split("\n")) {
      const parts = line.split("|");
      if (parts.length < 5) continue;
      const symbol = parts[1];
      if (!want.has(symbol)) continue;
      const short = parseFloat(parts[2]);
      const total = parseFloat(parts[4]);
      if (Number.isFinite(short) && Number.isFinite(total) && total > 0) {
        out.set(symbol, short / total);
      }
      if (out.size === want.size) break;
    }
  } catch (err) {
    console.warn("[finra] fetch failed — features without short ratio:", (err as Error).message);
  }
  return out;
}
