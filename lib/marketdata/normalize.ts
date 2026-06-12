import type { GainerRow, RawGainer } from "./types";

// Product filters: real, liquid names only. Applied locally so we control them
// independent of the provider.
export const MIN_PRICE = 3;
export const MIN_MARKET_CAP = 25_000_000;

// Only NASDAQ/NYSE common stock: 1–4 uppercase letters. This drops OTC 5-letter
// symbols, foreign ADRs, and class/unit/warrant tickers (dots/suffixes). Rare
// 5-letter listed names (e.g. GOOGL) are intentionally excluded — they're never
// top daily gainers anyway.
export const TICKER_RE = /^[A-Z]{1,4}$/;

/**
 * Filter → sort (change% desc) → rank → slice.
 * A filter is skipped when its value is null/undefined (some providers don't
 * supply market cap in the bulk snapshot — see polygon.ts), so we never drop a
 * row just because a field is unknown.
 */
export function rankAndFilter(rows: RawGainer[], limit: number): GainerRow[] {
  return rows
    .filter((r) => TICKER_RE.test(r.ticker))
    .filter((r) => r.price == null || r.price >= MIN_PRICE)
    .filter((r) => r.marketCap == null || r.marketCap >= MIN_MARKET_CAP)
    .filter((r) => r.changePercent != null && r.changePercent > 0)
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
