import type { GainerRow, RawGainer } from "./types";

// Product filters: real, liquid names only. Applied locally so we control them
// independent of the provider.
//
// THE FLOORS ARE MEASURED AT THE PREVIOUS SESSION'S CLOSE, NOT THE LIVE PRICE.
// They exist to match the Stock Market Game's own eligibility bar, and the game
// reads that bar off where a stock closed the day before: an order entered
// today fills at today's close, but whether the security may be traded at all
// was settled last night. `r.price` is the scanner's `close` column — the last
// trade — so testing it answers the wrong question. A name up 100% at $3.10
// clears a live $3 floor having closed at $1.55, and the game refuses it.
//
// Ranking by largest % gain makes that the NORMAL case at rank 1, not an edge
// case: the biggest movers are by construction the ones that were cheap
// yesterday. That is the row a reader acts on first and the row the pre-close
// thesis drop writes about, so a live-price floor put an unusable name at the
// top of the board and spent a thesis on it (NUR, 2026-09-08). Both prior
// figures are recoverable from columns already on every row — no extra fetch,
// see previousClose / previousMarketCap — so the board is filtered on what the
// game will actually accept.
//
// The cost is deliberate: this shifts the board toward more moderate gainers
// (a +100% name now has to trade above $6 to have closed above $3) and returns
// fewer rows. Fewer tradeable rows beats more untradeable ones.
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
 * Undo today's percentage move on a figure that scales with the share price.
 *
 * Null when either input is missing, or when the change% implies a
 * non-positive prior value. That last guard is unreachable for a gainer
 * (change% > 0), and exists so a corrupt row reporting ≤ −100% can never
 * divide by ~0 and manufacture an enormous "previous close" that sails past
 * every floor below.
 */
function beforeTodaysMove(
  value: number | null,
  changePercent: number | null,
): number | null {
  if (value == null || changePercent == null) return null;
  const factor = 1 + changePercent / 100;
  if (!(factor > 0)) return null;
  return value / factor;
}

/**
 * The previous session's close, back-solved from the live price and the day's
 * change%. The scanner measures `change` against exactly that close
 * (change% = (price − prevClose) / prevClose × 100), so this is an identity
 * rather than an estimate — it loses only the provider's own rounding.
 */
export function previousClose(
  price: number | null,
  changePercent: number | null,
): number | null {
  return beforeTodaysMove(price, changePercent);
}

/**
 * The previous session's market cap. Unlike the close this IS an estimate: it
 * assumes the share count didn't change overnight, which a same-day offering
 * or a split breaks. Fine for a floor — split-date rows are already dropped by
 * isLikelySplitArtifact, and a dilution big enough to move a name across the
 * $25M line is not one this board should be recommending anyway.
 */
export function previousMarketCap(
  marketCap: number | null,
  changePercent: number | null,
): number | null {
  return beforeTodaysMove(marketCap, changePercent);
}

/**
 * Does this row clear the floors where the GAME measures them — at the previous
 * close?
 *
 * Null-skips-filter, matching rankAndFilter's convention throughout: a row
 * whose price or change% we don't know is kept rather than dropped on a figure
 * we couldn't compute.
 *
 * This subsumes the live-price floors it replaced. For any row with a positive
 * change% the previous close is strictly BELOW the live price, so
 * `previousClose >= MIN_PRICE` already implies `price > MIN_PRICE`; keeping
 * both would just be two spellings of the same bar, one of them wrong.
 */
export function isGameEligible(row: {
  price: number | null;
  marketCap: number | null;
  changePercent: number | null;
}): boolean {
  const close = previousClose(row.price, row.changePercent);
  if (close != null && close < MIN_PRICE) return false;
  const cap = previousMarketCap(row.marketCap, row.changePercent);
  if (cap != null && cap < MIN_MARKET_CAP) return false;
  return true;
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
 * The change% check runs before isGameEligible on purpose: the previous close
 * is derived FROM change%, so a row without one has no eligibility to test.
 */
export function rankAndFilter(rows: RawGainer[], limit: number): GainerRow[] {
  return rows
    .filter((r) => TICKER_RE.test(r.ticker))
    .filter((r) => r.changePercent != null && r.changePercent > 0)
    .filter(isGameEligible)
    .filter((r) => !isLikelySplitArtifact(r.changePercent, r.relativeVolume))
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
