import {
  type GainerRow,
  type MarketDataProvider,
  type ProviderMarketStatus,
  type RawGainer,
  ProviderError,
} from "./types";
import { rankAndFilter, MIN_PRICE } from "./normalize";
import { getMarketSession } from "../market-calendar";
import { withRetry } from "../retry";

// Exported for lib/quant/technicals.ts, which hits the same scanner endpoint.
export const SCAN_URL = "https://scanner.tradingview.com/america/scan";

// `s` looks like "NASDAQ:INHD" / "NYSE:XYZ" / "OTC:AONC". Allow only the two
// major exchanges (client-side guard backing the payload filter).
const ALLOWED_EXCHANGE = /^(NASDAQ|NYSE):/;

// Common stock only — exclude ETFs/funds, ADRs/DRs, preferreds, warrants,
// units, structured products. (d[8] = type, d[9] = typespecs.)
function isCommonStock(entry: { d: unknown[] }): boolean {
  const type = entry.d[8];
  const specs = entry.d[9];
  return type === "stock" && Array.isArray(specs) && specs.includes("common");
}

// Column order matters — the response `d` array maps positionally to this list.
const COLUMNS = [
  "name", // 0  ticker symbol
  "description", // 1  company name
  "close", // 2  price
  "change", // 3  change %
  "volume", // 4
  "relative_volume_10d_calc", // 5
  "market_cap_basic", // 6  market cap
  "sector", // 7
  "type", // 8  security type: stock | fund | dr | structured | ...
  "typespecs", // 9  e.g. ["common"], ["preferred"]
] as const;

// Realistic UA — TradingView blocks obvious bots. (Undocumented endpoint with
// ToS risk — the sole provider, revisit before any commercial scale.)
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface ScanResponse {
  totalCount: number;
  data: Array<{ s: string; d: unknown[] }>;
}

function buildPayload(limit: number) {
  return {
    filter: [
      { left: "close", operation: "egreater", right: MIN_PRICE },
      { left: "change", operation: "greater", right: 0 },
      // NASDAQ/NYSE only — no OTC or other exchanges.
      { left: "exchange", operation: "in_range", right: ["NASDAQ", "NYSE"] },
    ],
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: [...COLUMNS],
    sort: { sortBy: "change", sortOrder: "desc" },
    // Over-fetch so the local filters still leave us `limit` rows.
    range: [0, Math.max(limit * 2, 100)],
  };
}

async function postScan(limit: number): Promise<ScanResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(SCAN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        origin: "https://www.tradingview.com",
        referer: "https://www.tradingview.com/",
      },
      body: JSON.stringify(buildPayload(limit)),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new ProviderError(
        `scanner returned ${res.status}`,
        "tradingview",
      );
    }
    return (await res.json()) as ScanResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mapRow(entry: { s: string; d: unknown[] }): RawGainer {
  const d = entry.d;
  return {
    ticker: (d[0] as string) ?? entry.s.split(":").pop() ?? entry.s,
    companyName: (d[1] as string) ?? null,
    price: toNum(d[2]),
    changePercent: toNum(d[3]),
    volume: toNum(d[4]),
    relativeVolume: toNum(d[5]),
    marketCap: toNum(d[6]),
    sector: (d[7] as string) ?? null,
  };
}

export const tradingViewProvider: MarketDataProvider = {
  name: "tradingview",

  async getTopGainers(limit: number): Promise<GainerRow[]> {
    try {
      // 3 tries, exponential backoff + jitter — covers transient blocks/timeouts
      // without adding much latency to the on-read path (worst case ~2.4s).
      const json = await withRetry(() => postScan(limit), {
        onRetry: (err, attempt, delay) =>
          console.warn(
            `[tradingview] retry ${attempt} in ${Math.round(delay)}ms:`,
            (err as Error)?.message,
          ),
      });
      const raw = (json.data ?? [])
        .filter((e) => ALLOWED_EXCHANGE.test(e.s))
        .filter(isCommonStock)
        .map(mapRow);
      return rankAndFilter(raw, limit);
    } catch (err) {
      throw err instanceof ProviderError
        ? err
        : new ProviderError(
            `fetch failed: ${(err as Error)?.message ?? "unknown"}`,
            "tradingview",
          );
    }
  },

  async getMarketStatus(): Promise<ProviderMarketStatus> {
    return { open: getMarketSession() === "open", asOf: new Date().toISOString() };
  },
};
