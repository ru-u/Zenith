// Normalized shape every provider returns. The cron, cache, API routes, and UI
// only ever see GainerRow — swapping providers never changes anything downstream.
export interface GainerRow {
  ticker: string;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  relativeVolume: number | null;
  marketCap: number | null;
  sector: string | null;
  rank: number;
}

export interface ProviderMarketStatus {
  open: boolean;
  asOf: string; // ISO timestamp
}

export interface MarketDataProvider {
  readonly name: string;
  /** Ranked, normalized top gainers (full-market scan ranked locally). */
  getTopGainers(limit: number): Promise<GainerRow[]>;
  getMarketStatus(): Promise<ProviderMarketStatus>;
}

export type ProviderName = "tradingview" | "polygon";

/** Raw row before ranking/filtering — all fields optional/nullable. */
export type RawGainer = Omit<GainerRow, "rank">;

// Thrown when a provider fetch fails; the API route catches this and serves
// the last cached rows rather than 500-ing.
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
