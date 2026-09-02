// Feature bucketing for the historical "closed lower next day" base rates (Phase 2).
// The thresholds here are mirrored in scripts/historical-base-rates.mjs — keep the
// two in sync (the script can't import this TS module under bare `node`).

export type CapBand = "nano" | "micro" | "small" | "mid";
export type RelvolBand = "rv_lt5" | "rv_5_20" | "rv_20_100" | "rv_100plus";
export type RangeBand = "r_lo" | "r_mid" | "r_hi";

const MIN_N = 30; // below this, fall back to a coarser bucket

// Tertile cuts of the historical day_range_pct distribution (n=1,919), chosen
// as tertiles rather than round numbers on purpose: the prototype CSV's range
// denominator is unknown (high-low over low, or over open), so absolute
// thresholds could silently mean something different live than they did in the
// fit. Tertiles survive any near-monotone difference in formula. Down-rates by
// band are 54.3% / 60.8% / 67.5% — the gradient holds within every cap band and
// every relvol band, so this is independent signal, not relvol in disguise.
const RANGE_T1 = 30.1;
const RANGE_T2 = 53.9;

const RELVOL_LABEL: Record<RelvolBand, string> = {
  rv_lt5: "relvol <5",
  rv_5_20: "relvol 5–20",
  rv_20_100: "relvol 20–100",
  rv_100plus: "relvol 100+",
};

const RANGE_LABEL: Record<RangeBand, string> = {
  r_lo: "narrow-range",
  r_mid: "mid-range",
  r_hi: "wide-range",
};

export function capBand(marketCap: number | null | undefined): CapBand | null {
  if (marketCap == null || !Number.isFinite(marketCap)) return null;
  if (marketCap < 50e6) return "nano";
  if (marketCap < 300e6) return "micro";
  if (marketCap < 2e9) return "small";
  return "mid";
}

export function relvolBand(relvol: number | null | undefined): RelvolBand | null {
  if (relvol == null || !Number.isFinite(relvol)) return null;
  if (relvol < 5) return "rv_lt5";
  if (relvol < 20) return "rv_5_20";
  if (relvol < 100) return "rv_20_100";
  return "rv_100plus";
}

export function rangeBand(rangePct: number | null | undefined): RangeBand | null {
  if (rangePct == null || !Number.isFinite(rangePct)) return null;
  if (rangePct < RANGE_T1) return "r_lo";
  if (rangePct < RANGE_T2) return "r_mid";
  return "r_hi";
}

/**
 * Today's intraday range as a percent of the low — the magnitude dimension the
 * cap×relvol buckets don't carry. Null whenever the technicals fetch didn't
 * return both legs, which degrades the lookup to the range-free bucket rather
 * than guessing.
 */
export function dayRangePct(
  high: number | null | undefined,
  low: number | null | undefined,
): number | null {
  if (high == null || low == null) return null;
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  if (low <= 0 || high < low) return null;
  return ((high - low) / low) * 100;
}

export type BaseRate = {
  cap_band: string;
  relvol_band: string;
  range_band: string;
  n: number;
  down_rate: number; // 0..1
  median_next_day_return: number | null;
  // Conditional medians (fractions, like median_next_day_return): the typical
  // move when the next day closed lower / higher. Nullable — older table
  // contents predate these columns, and everything degrades to null.
  median_down_move: number | null;
  median_up_move: number | null;
};

/**
 * Resolve the best base-rate bucket for a live ticker, most specific first.
 *
 * The chain drops relvol before it drops range: only 25 of the 47 populated
 * three-way cells clear MIN_N, but cap×range is dense (11 of 12 cells clear it)
 * and range carries more signal than relvol at the margin. A ticker whose
 * technicals came back without high/low simply has no range band and falls
 * through to the two-dimensional buckets — scoring exactly as it did before.
 *
 * The range-only rung near the bottom is what a ticker with an unknown market
 * cap lands on: without it that ticker drops straight to the global 60.9% and
 * throws away a signal worth 54.3/60.8/67.5 across the three bands.
 */
export function resolveBaseRate(
  rows: BaseRate[],
  marketCap: number | null | undefined,
  relvol: number | null | undefined,
  rangePct: number | null | undefined,
): BaseRate | null {
  const map = new Map(
    rows.map((r) => [`${r.cap_band}|${r.relvol_band}|${r.range_band ?? "ALL"}`, r]),
  );
  const cap = capBand(marketCap);
  const rv = relvolBand(relvol);
  const rg = rangeBand(rangePct);

  const keys: string[] = [];
  if (cap && rv && rg) keys.push(`${cap}|${rv}|${rg}`);
  if (cap && rg) keys.push(`${cap}|ALL|${rg}`);
  if (cap && rv) keys.push(`${cap}|${rv}|ALL`);
  if (cap) keys.push(`${cap}|ALL|ALL`);
  if (rg) keys.push(`ALL|ALL|${rg}`);
  keys.push("ALL|ALL|ALL");

  for (const k of keys) {
    const r = map.get(k);
    if (r && r.n >= MIN_N) return r;
  }
  return map.get("ALL|ALL|ALL") ?? null;
}

/**
 * Expected next-day move for a short setup, in percent: the probability-weighted
 * average of the bucket's conditional medians. Negative = the setup typically
 * pays a short. Null when the bucket predates the conditional-median columns.
 * This is the payoff dimension the 1-10 score doesn't carry — a merger stock
 * may close lower 55% of days by ~0%, while a parabolic micro-cap fades 60% of
 * the time by -8%; the DECA game grades the magnitude, not the hit rate.
 */
export function expectedMovePercent(
  percentWin: number,
  r: BaseRate | null,
): number | null {
  if (!r || r.median_down_move == null || r.median_up_move == null) return null;
  const p = percentWin / 100;
  return (p * r.median_down_move + (1 - p) * r.median_up_move) * 100;
}

/** A one-line empirical prior to drop into the thesis prompt. */
export function formatBaseRatePrior(r: BaseRate | null): string | null {
  if (!r) return null;
  const pct = Math.round(r.down_rate * 100);

  // Built compositionally so the string always names exactly the dimensions the
  // resolved bucket actually used — a coarser fallback must not claim precision
  // it doesn't have. Users read this sentence in the thesis.
  const parts: string[] = [];
  if (r.cap_band !== "ALL") parts.push(`${r.cap_band}-cap`);
  if (r.relvol_band !== "ALL") {
    parts.push(RELVOL_LABEL[r.relvol_band as RelvolBand] ?? r.relvol_band);
  }
  if (r.range_band && r.range_band !== "ALL") {
    parts.push(RANGE_LABEL[r.range_band as RangeBand] ?? r.range_band);
  }
  const scope = parts.length === 0 ? "all historical top-gainers" : `${parts.join(", ")} gainers`;

  let medStr = "";
  if (r.median_next_day_return != null) {
    const m = r.median_next_day_return * 100;
    medStr = `, median next-day move ${m >= 0 ? "+" : ""}${m.toFixed(1)}%`;
  }
  return `Historical base rate (~1yr of ${scope}, n=${r.n}): closed LOWER the next session ${pct}% of the time${medStr}.`;
}
