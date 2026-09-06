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

// A reverse split on its effective date can print as a massive fake "gain":
// the provider's change% compares the post-split price against the unadjusted
// pre-split close (ENLV's 15:1 split showed +1414% on a real ~+1% move). Real
// moves that size always come with exploding turnover (JLHL +310% → relvol 66;
// INHD +3661% → relvol 3038), so an extreme change% WITHOUT volume expansion is
// a corporate-action artifact, not a gainer. Null relvol → keep: we drop only
// on positive evidence, matching rankAndFilter's null-skips-filter convention.
// Splits smaller than ~5:2 fall under the threshold — the full fix is a splits
// calendar; this is the backstop for the common compliance-driven ratios.
export const SPLIT_ARTIFACT_MIN_CHANGE = 150; // %
export const SPLIT_ARTIFACT_MAX_RELVOL = 5;

export function isLikelySplitArtifact(
  changePercent: number | null,
  relativeVolume: number | null,
): boolean {
  if (changePercent == null || changePercent < SPLIT_ARTIFACT_MIN_CHANGE) {
    return false;
  }
  return relativeVolume != null && relativeVolume < SPLIT_ARTIFACT_MAX_RELVOL;
}

/**
 * The session a whole batch describes: the MODAL `sessionDate` across its rows,
 * or null when no row carries one.
 *
 * Mode rather than "every row must agree": a halted or thinly-traded name keeps
 * reporting a stale daily bar (the same behaviour dropFrozenRepeats cleans up
 * after), so demanding unanimity would reject perfectly good batches every day.
 * The distribution this reads is bimodal in practice — either ~all rows are
 * today's or ~all are the previous session's — so the mode is unambiguous.
 */
export function batchSessionDate(rows: Array<{ sessionDate: string | null }>): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.sessionDate == null) continue;
    counts.set(r.sessionDate, (counts.get(r.sessionDate) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [date, count] of counts) {
    // Ties break toward the later date — the newer bar is the live session.
    if (count > bestCount || (count === bestCount && best != null && date > best)) {
      best = date;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Filter → sort (change% desc) → rank → slice.
 * A filter is skipped when its value is null/undefined, so we never drop a
 * row just because a field is unknown.
 */
export function rankAndFilter(rows: RawGainer[], limit: number): GainerRow[] {
  return rows
    .filter((r) => TICKER_RE.test(r.ticker))
    .filter((r) => r.price == null || r.price >= MIN_PRICE)
    .filter((r) => r.marketCap == null || r.marketCap >= MIN_MARKET_CAP)
    .filter((r) => r.changePercent != null && r.changePercent > 0)
    .filter((r) => !isLikelySplitArtifact(r.changePercent, r.relativeVolume))
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
