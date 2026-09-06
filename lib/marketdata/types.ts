// Normalized shape every provider returns. The cron, cache, API routes, and UI
// only ever see GainerRow — swapping providers never changes anything downstream.
export interface GainerRow {
  ticker: string;
  // Listing venue ("NASDAQ" | "NYSE") from the scanner's qualified symbol. A
  // bare ticker is ambiguous across venues (see lib/marketdata/symbols.ts) —
  // every symbol string handed to an external system must be qualified with
  // this. Null only for a provider that can't supply it.
  exchange: string | null;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  relativeVolume: number | null;
  marketCap: number | null;
  sector: string | null;
  // ET date key (YYYY-MM-DD) of the SESSION these figures describe, from the
  // provider's daily-bar timestamp. Load-bearing: TradingView's scanner is
  // 15-min delayed, so between 9:30 and ~9:47 ET it still serves YESTERDAY's
  // bar — change% and all — and without this the read path files those numbers
  // under today's date (see persistGainers' session gate). Null only for a
  // provider that can't supply it, which the gate treats as fail-open.
  sessionDate: string | null;
  rank: number;
}

export interface ProviderMarketStatus {
  open: boolean;
  asOf: string; // ISO timestamp
}

export interface MarketDataProvider {
  readonly name: string;
  /**
   * How far behind real time this provider's data runs, in seconds (0 for a
   * real-time source). The read path's warm-up floor is derived from it:
   * today's session cannot exist upstream until the open plus this, so probing
   * before then is guaranteed to return the previous session. Kept on the
   * interface rather than read off a concrete provider so the routes stay
   * provider-agnostic.
   */
  readonly feedDelaySeconds: number;
  /** Ranked, normalized top gainers (full-market scan ranked locally). */
  getTopGainers(limit: number): Promise<GainerRow[]>;
  getMarketStatus(): Promise<ProviderMarketStatus>;
}

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
