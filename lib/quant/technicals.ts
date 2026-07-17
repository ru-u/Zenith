// Per-ticker technical indicators for the thesis engine, from the same
// TradingView scanner the gainers provider already uses (Stooq/yfinance-style
// sources are bot-walled; this reuses our existing headers/retry posture).
// One POST covers the whole top-5. Any failure degrades to an empty map —
// scoring then runs on catalyst + base rate alone, mirroring the
// ProviderError→cached-serve resilience pattern.

import { SCAN_URL, USER_AGENT } from "../marketdata/tradingview";
import { withRetry } from "../retry";

const REQUEST_TIMEOUT_MS = 8_000;

export interface Technicals {
  rsi: number | null; // RSI(14), daily
  atr: number | null;
  sma50: number | null;
  sma200: number | null;
  gapPercent: number | null; // today's open vs prior close
  changeFromOpen: number | null; // % since today's open (negative = fading intraday)
  volatilityD: number | null;
  vwap: number | null;
  high52w: number | null;
  floatShares: number | null;
  // Price-path context (feature capture — see lib/quant/features.ts):
  low52w: number | null;
  perfW: number | null; // % return over the past week
  perf1M: number | null;
  perf3M: number | null;
  high1M: number | null; // windowed highs/lows (include today's session)
  low1M: number | null;
  high3M: number | null;
  low3M: number | null;
  avgVol10d: number | null;
  dayOpen: number | null; // today's OHL, for gap/pinned-tape math
  dayHigh: number | null;
  dayLow: number | null;
}

// Column order matters — the response `d` array maps positionally to this list.
const COLUMNS = [
  "name", // 0 ticker symbol
  "close", // 1 price (sanity anchor for vwap/52w comparisons)
  "RSI", // 2
  "ATR", // 3
  "SMA50", // 4
  "SMA200", // 5
  "gap", // 6
  "change_from_open", // 7
  "Volatility.D", // 8
  "VWAP", // 9
  "price_52_week_high", // 10
  "float_shares_outstanding", // 11
  "price_52_week_low", // 12
  "Perf.W", // 13
  "Perf.1M", // 14
  "Perf.3M", // 15
  "High.1M", // 16
  "Low.1M", // 17
  "High.3M", // 18
  "Low.3M", // 19
  "average_volume_10d_calc", // 20
  "open", // 21
  "high", // 22
  "low", // 23
] as const;

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function postScan(tickers: string[]): Promise<{ data?: Array<{ s: string; d: unknown[] }> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(SCAN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        origin: "https://www.tradingview.com",
        referer: "https://www.tradingview.com/",
      },
      body: JSON.stringify({
        // We only know the bare symbol, not the exchange — request both
        // prefixes; unknown combinations are simply omitted from the response.
        symbols: {
          tickers: tickers.flatMap((t) => [`NASDAQ:${t}`, `NYSE:${t}`]),
          query: { types: [] },
        },
        columns: [...COLUMNS],
        options: { lang: "en" },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`scanner returned ${res.status}`);
    return (await res.json()) as { data?: Array<{ s: string; d: unknown[] }> };
  } finally {
    clearTimeout(timeout);
  }
}

/** Technicals for a small ticker list, keyed by bare symbol. Empty map on failure. */
export async function fetchTechnicals(tickers: string[]): Promise<Map<string, Technicals>> {
  const out = new Map<string, Technicals>();
  if (tickers.length === 0) return out;
  try {
    const json = await withRetry(() => postScan(tickers), {
      onRetry: (err, attempt, delay) =>
        console.warn(
          `[technicals] retry ${attempt} in ${Math.round(delay)}ms:`,
          (err as Error)?.message,
        ),
    });
    for (const entry of json.data ?? []) {
      const d = entry.d;
      const ticker = (d[0] as string) ?? entry.s.split(":").pop();
      if (!ticker || out.has(ticker)) continue;
      out.set(ticker, {
        rsi: toNum(d[2]),
        atr: toNum(d[3]),
        sma50: toNum(d[4]),
        sma200: toNum(d[5]),
        gapPercent: toNum(d[6]),
        changeFromOpen: toNum(d[7]),
        volatilityD: toNum(d[8]),
        vwap: toNum(d[9]),
        high52w: toNum(d[10]),
        floatShares: toNum(d[11]),
        low52w: toNum(d[12]),
        perfW: toNum(d[13]),
        perf1M: toNum(d[14]),
        perf3M: toNum(d[15]),
        high1M: toNum(d[16]),
        low1M: toNum(d[17]),
        high3M: toNum(d[18]),
        low3M: toNum(d[19]),
        avgVol10d: toNum(d[20]),
        dayOpen: toNum(d[21]),
        dayHigh: toNum(d[22]),
        dayLow: toNum(d[23]),
      });
    }
  } catch (err) {
    console.warn("[technicals] fetch failed — scoring without technicals:", (err as Error).message);
  }
  return out;
}
