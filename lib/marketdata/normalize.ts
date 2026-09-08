import type { GainerRow, RawGainer } from "./types";

// Product filters: real, liquid names only. Applied locally so we control them
// independent of the provider.
//
// Both floors are measured against the PREVIOUS CLOSE, because that is what DECA
// measures. `r.price` is the scanner's `close` column — the last trade, not
// yesterday's close — so checking the floors against it lists rows that are
// untradeable in the game, and ranking by largest % gain makes that worst
// exactly at rank 1 (2026-09-08, day one of the competition: NUR +70.6% at
// $3.02, i.e. a $1.77 close and a $23.2M cap — under both floors).
export const MIN_PRICE = 3;
export const MIN_MARKET_CAP = 25_000_000;

/**
 * Back out the previous session's price and market cap from the live figures.
 *
 * `changePercent` is measured against the previous close, so the prior price is
 * just `price / (1 + changePercent/100)`. Checked against Finnhub's `/quote`
 * `pc` for all 25 of a session's top rows (2026-09-08): exact to four decimals,
 * 25/25 — the scanner's own two columns are self-consistent, so there is no
 * third-party lookup to add here.
 *
 * The cap divides by the same factor, which assumes shares outstanding did not
 * change overnight. That holds for a normal session but NOT across a dilutive
 * offering, so the cap half is approximate where the price half is exact.
 *
 * Returns nulls rather than throwing: an unknown input must not become a
 * confident answer, and every caller treats null as "don't filter on this".
 */
export function previousSessionFigures(
  price: number | null,
  changePercent: number | null,
  marketCap: number | null,
): { price: number | null; marketCap: number | null } {
  const factor = changePercent == null ? null : 1 + changePercent / 100;
  if (factor == null || !Number.isFinite(factor) || factor <= 0) {
    return { price: null, marketCap: null };
  }
  return {
    price: price == null ? null : price / factor,
    marketCap: marketCap == null ? null : marketCap / factor,
  };
}

/**
 * Relative slack on the floor comparisons, because the previous figures are a
 * division and the floors are exact. A stock that closed at exactly $3.00 and
 * gained exactly 10% comes back as 2.9999999999999996, which would drop a row
 * that is precisely on the line. A millionth is far below any real price or cap
 * difference — $2.99 and a $24.99M cap still fail — so this only absorbs the
 * float error, never a genuine miss.
 */
const FLOOR_EPSILON = 1e-6;

/**
 * Could a competitor actually trade this row? DECA reads both floors off the
 * PREVIOUS close, so a name up 100% to $3.10 closed at $1.55 and is ineligible
 * however it looks on the board right now.
 *
 * Null skips its half of the check, matching rankAndFilter's convention — we
 * drop only on positive evidence. Safe in practice: every stored row with an
 * unknown market cap is a fund or preferred (SLBT, MFP, OPI, ADIG), not a
 * gainer, and all of them clear the price floor anyway.
 *
 * Strictly additive to the live-price floors it replaces: for a row that is UP,
 * `prevPrice >= MIN_PRICE` implies `price > MIN_PRICE`, and likewise for the
 * cap — so this only ever removes rows, and the scanner's server-side
 * `close >= MIN_PRICE` filter never withholds one it would have kept.
 */
export function isGameEligible(
  price: number | null,
  changePercent: number | null,
  marketCap: number | null,
): boolean {
  const prev = previousSessionFigures(price, changePercent, marketCap);
  if (prev.price != null && prev.price < MIN_PRICE * (1 - FLOOR_EPSILON)) {
    return false;
  }
  if (
    prev.marketCap != null &&
    prev.marketCap < MIN_MARKET_CAP * (1 - FLOOR_EPSILON)
  ) {
    return false;
  }
  return true;
}

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
 *
 * The eligibility filter runs BEFORE the slice, so dropping an ineligible name
 * pulls the next candidate up rather than leaving a short board — which is why
 * the provider over-fetches (see the `range` in tradingview.ts). It also runs
 * after the `changePercent > 0` filter, so by then every surviving row is up
 * and the floors it applies are strictly tighter than the live-price ones it
 * replaces.
 */
export function rankAndFilter(rows: RawGainer[], limit: number): GainerRow[] {
  return rows
    .filter((r) => TICKER_RE.test(r.ticker))
    .filter((r) => r.changePercent != null && r.changePercent > 0)
    .filter((r) => isGameEligible(r.price, r.changePercent, r.marketCap))
    .filter((r) => !isLikelySplitArtifact(r.changePercent, r.relativeVolume))
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
