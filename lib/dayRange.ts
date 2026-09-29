import { previousSessionFigures } from "./marketdata/normalize";

// Where the price sits inside today's range, and how much of today's gain it
// has given back. One module for both consumers — the day-range meter in the UI
// (components/gainers/DayRangeMeter.tsx) and the quant engine's feature capture
// (lib/quant/features.ts, the 3:30 board snapshot in lib/quant/outcomes.ts) — so
// the figure a student sees on the meter is the figure the engine records.
//
// Pure and dependency-light on purpose: it is imported by a client component.

export interface DayRange {
  /** 0 = at the day's low, 1 = at the high. */
  pos: number;
  /** % below the day's high; null when the range is a single print. */
  offHigh: number | null;
}

/**
 * Null when any input is missing (rows stored before the columns existed) or
 * the range is inverted, which means bad upstream data rather than a real
 * session — rendering a confident marker off it would be worse than nothing.
 *
 * The clamp is only for float/rounding: the three figures come from one daily
 * bar, and a live probe of the top 40 rows (2026-09-25) had 40/40 inside it.
 */
export function dayRangePosition(
  price: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): DayRange | null {
  if (price == null || low == null || high == null) return null;
  if (![price, low, high].every(Number.isFinite) || high < low || high <= 0) {
    return null;
  }
  // A halted name or a single print has no range to place the price within.
  if (high === low) return { pos: 0.5, offHigh: null };
  const pos = Math.min(1, Math.max(0, (price - low) / (high - low)));
  const offHigh = Math.max(0, ((high - price) / high) * 100);
  return { pos, offHigh };
}

/**
 * "−2.7% off high" / "−29% off high", or "At high" when it rounds to zero.
 * The decimal goes at 10%+ because it buys nothing there and the label row has
 * to fit a 144px column between two prices (measured: 27 of 50 rows overflowed
 * with it).
 */
export function formatOffHigh(offHigh: number | null): string {
  if (offHigh == null) return "Flat range";
  const rounded = Math.round(offHigh * 10) / 10;
  if (rounded === 0) return "At high";
  return rounded >= 10
    ? `−${Math.round(offHigh)}% off high`
    : `−${rounded.toFixed(1)}% off high`;
}

/**
 * The engine's day-range features, as stored in `ai_analyses.features` and
 * `drop_board_snapshots`. Snake-case because they are persisted as-is.
 */
export interface DayRangeFeatures {
  /** 0 = at the day's low, 1 = at the high. */
  position: number;
  /** % below the day's high, >= 0. Null for a single-print range. */
  off_high_pct: number | null;
  /**
   * Share of the day's peak gain given back from the high:
   * (high − price) / (high − previous close). 0 = still at the high; 0.8 = up
   * 100% at the peak, now up 20%. Can exceed 1 once the stock is red on the
   * day. Null when the high never cleared the previous close, or the change
   * (and so the previous close) is unknown.
   *
   * This, not `position`, is the candidate signal: gainers close in the top
   * third of their range 82% of the time (board_outcomes, 797 rows, 2026-09-29),
   * so position barely separates the board, while two stocks at the same
   * position can have given back 5% or 60% of their move.
   */
  giveback_of_gain: number | null;
}

/**
 * The previous close is backed out of price and change% — the same exact
 * derivation isGameEligible uses (previousSessionFigures, checked against
 * Finnhub to four decimals) — so no extra lookup is needed.
 */
export function computeDayRange(
  price: number | null | undefined,
  changePercent: number | null | undefined,
  high: number | null | undefined,
  low: number | null | undefined,
): DayRangeFeatures | null {
  const range = dayRangePosition(price, low, high);
  if (!range || price == null || high == null) return null;
  const prevClose = previousSessionFigures(price, changePercent ?? null, null).price;
  const giveback =
    prevClose != null && high > prevClose
      ? Math.max(0, (high - price) / (high - prevClose))
      : null;
  return {
    position: range.pos,
    off_high_pct: range.offHigh,
    giveback_of_gain: giveback,
  };
}
