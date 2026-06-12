import {
  type GainerRow,
  type MarketDataProvider,
  type ProviderMarketStatus,
  type RawGainer,
  ProviderError,
} from "./types";
import { rankAndFilter } from "./normalize";
import { getMarketSession } from "../market-calendar";

// Full-market snapshot — 10,000+ tickers. We rank the whole snapshot ourselves
// because the dedicated /gainers endpoint only returns 20 (too few for our use).
const SNAPSHOT_URL =
  "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers";

interface SnapshotTicker {
  ticker: string;
  todaysChangePerc?: number;
  day?: { c?: number; v?: number };
  prevDay?: { c?: number; v?: number };
  lastTrade?: { p?: number };
}

interface SnapshotResponse {
  status?: string;
  tickers?: SnapshotTicker[];
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
}

function mapRow(t: SnapshotTicker): RawGainer {
  // Snapshot lacks company name / sector / market cap / relative volume.
  // Phase 6 cutover: enrich the top ~100 via /v3/reference/tickers/{ticker}
  // (Starter has unlimited calls) to populate those + apply the market-cap filter.
  return {
    ticker: t.ticker,
    companyName: null,
    price: toNum(t.day?.c) ?? toNum(t.lastTrade?.p) ?? toNum(t.prevDay?.c),
    changePercent: toNum(t.todaysChangePerc),
    volume: toNum(t.day?.v),
    relativeVolume: null,
    marketCap: null,
    sector: null,
  };
}

export const polygonProvider: MarketDataProvider = {
  name: "polygon",

  async getTopGainers(limit: number): Promise<GainerRow[]> {
    const key = process.env.POLYGON_API_KEY;
    if (!key) {
      throw new ProviderError("POLYGON_API_KEY is not set", "polygon");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `${SNAPSHOT_URL}?apiKey=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) {
        throw new ProviderError(`snapshot returned ${res.status}`, "polygon");
      }
      const json = (await res.json()) as SnapshotResponse;
      const raw = (json.tickers ?? []).map(mapRow);
      return rankAndFilter(raw, limit);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `fetch failed: ${(err as Error)?.message ?? "unknown"}`,
        "polygon",
      );
    } finally {
      clearTimeout(timeout);
    }
  },

  async getMarketStatus(): Promise<ProviderMarketStatus> {
    return { open: getMarketSession() === "open", asOf: new Date().toISOString() };
  },
};
