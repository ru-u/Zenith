// Deterministic next-day short scoring — pure functions, no I/O.
//
// percent_win_estimate starts from the empirical base rate (realized "closed
// lower next session" frequency for this cap×relvol×range bucket) and applies
// the catalyst/technical adjustments below.
//
// The catalyst Δs are FROZEN and remain unfitted priors carried over from the
// old LLM prompt (buyouts pin, offerings fade, real news runs, squeezes are
// wild). They cannot be re-fit from the live record: across 171 scored theses
// with outcomes there are 53 earnings, 14 buyouts, 12 offerings, 7 regulatory,
// and ZERO partnership/meme/macro. D_OFFERING is the largest weight in the
// model and rests on twelve observations whose 95% CI spans 49 points — a naive
// re-fit would swing it 21 points on six coin flips. Only D_EARNINGS has the
// sample to say anything, and it confirms the current value. Waiting does not
// help either: offerings arrive 0.34 per session, so n=200 is ~2.2 years out.
// The unlock is scripts/backfill-catalysts.mjs, which labels the 1,919
// historical rows; re-fit from those, not from these.

import type { GainerRow } from "../marketdata/types";
import type { BaseRate } from "../baseRates";
import type { Technicals } from "./technicals";

// ── tuning surface (Δs are percentage points on percent_win_estimate) ──
const D_OFFERING = 8; // dilution → fade-prone
const D_EARNINGS = -5; // genuine results can keep running
const D_REGULATORY = -5; // genuine FDA/clinical wins can keep running
const D_PARTNERSHIP = -3;
// Pinned near a deal price, so there is no directional edge either way — a coin
// flip on a stock that barely moves. Was 20, which scripts/calibration.mjs
// showed to be the single worst constant in this file: predicted 20.0% against
// a realized 50.0% (n=14, 95% CI [26.8, 73.2] — the old value sat outside the
// interval). That one number was enough to drive the engine's whole Brier skill
// score negative, i.e. its stated probabilities were worse than always guessing
// the base rate; correcting it flips skill positive.
//
// This does NOT make buyouts shortable: `score = min(score, 2)` below is a
// separate cap and still applies. What it fixes is the honesty of the stated
// probability, which also feeds expectedMovePercent.
const BUYOUT_WIN_CEILING = 50;
const MEME_PULL_TO_50 = 0.5; // squeeze variance: pull this fraction toward a coin flip
const D_RSI_OVERBOUGHT = 4; // daily RSI above RSI_OVERBOUGHT
const RSI_OVERBOUGHT = 80;
const D_FADING_INTRADAY = 3; // already selling off since the open
const D_BELOW_VWAP = 2; // buyers underwater on the day
const D_NEAR_52W_HIGH = -2; // breakout strength — riskier short
const NEAR_52W_BAND = 0.02;
// (D_PARABOLIC removed — magnitude now enters through the base-rate range band.
// It was a binary +2 at a ≥100% day and the only place move size was visible at
// all; a ≥100% day is almost always in the top range tertile, which on its own
// carries a 67.5% down-rate, so keeping both would double-count.)
// Recent listings win often and lose catastrophically. Across the live record
// sub-90-day listings closed lower 71% of the time yet averaged -8.8% — the
// only age bucket with a negative mean — because the losses are unbounded on
// no float: USDE, 55 days listed, doubled overnight for the worst trade on
// record (-99.4%). A cap, not a Δ: it can stop a bad recommendation but never
// manufacture one, so it costs at most some upside on a thin sample.
const RECENT_LISTING_SCORE_CAP = 6;
const D_STREAK_PER_DAY = 0; // deliberately neutral (matches the old prompt); tunable
const WIN_FLOOR = 5; // never claim certainty in either direction
const WIN_CEILING = 95;

const FALLBACK_WIN = 50; // no base-rate table yet → coin flip prior

export interface ShortScore {
  short_score: number; // 1-10, 10 = most attractive next-day short
  percent_win_estimate: number; // 0-100, chance of a lower next-day close
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Map a win % onto the 1-10 score band: 20% → 1, 80% → 10, linear between. */
function winToScore(win: number): number {
  return Math.round(clamp(1 + ((win - 20) * 9) / 60, 1, 10));
}

// Catalyst classes with a real bullish story — a pinned-looking tape on top of
// genuine news is ambiguous, so the pinned cap defers to the catalyst there.
const BULLISH_CATALYSTS = new Set(["earnings", "regulatory", "partnership"]);

export function scoreShort(
  g: GainerRow,
  streakCount: number | null,
  baseRate: BaseRate | null,
  catalystType: string,
  tech: Technicals | null,
  /** Deal-price tape signature (lib/quant/features.ts computePinnedTape). */
  pinned = false,
  /** Listed within RECENT_LISTING_DAYS, or with under a month of tape. */
  recentListing = false,
): ShortScore {
  let win = baseRate ? baseRate.down_rate * 100 : FALLBACK_WIN;

  // Catalyst adjustments (buyout's hard ceiling is applied last so nothing
  // nudges a pinned deal back into shortable territory).
  switch (catalystType) {
    case "offering":
      win += D_OFFERING;
      break;
    case "earnings":
      win += D_EARNINGS;
      break;
    case "regulatory":
      win += D_REGULATORY;
      break;
    case "partnership":
      win += D_PARTNERSHIP;
      break;
    case "meme_squeeze":
      win += (50 - win) * MEME_PULL_TO_50;
      break;
  }

  // Technical adjustments — every field is optional; missing data is a no-op.
  if (tech) {
    if (tech.rsi != null && tech.rsi > RSI_OVERBOUGHT) win += D_RSI_OVERBOUGHT;
    if (tech.changeFromOpen != null && tech.changeFromOpen < 0) win += D_FADING_INTRADAY;
    if (tech.vwap != null && g.price != null && g.price < tech.vwap) win += D_BELOW_VWAP;
    if (
      tech.high52w != null &&
      g.price != null &&
      g.price >= tech.high52w * (1 - NEAR_52W_BAND)
    ) {
      win += D_NEAR_52W_HIGH;
    }
  }

  if (streakCount != null && streakCount > 1) win += D_STREAK_PER_DAY * (streakCount - 1);

  if (catalystType === "buyout") win = Math.min(win, BUYOUT_WIN_CEILING);
  win = clamp(Math.round(win), WIN_FLOOR, WIN_CEILING);

  let score = winToScore(win);
  // Risk caps by catalyst regardless of the win math (mirrors the old rules:
  // a pinned buyout is never an attractive short; squeezes are too wild).
  if (catalystType === "buyout") score = Math.min(score, 2);
  if (catalystType === "meme_squeeze") score = Math.min(score, 4);
  // Sector/macro-driven spike without a company catalyst (SKYQ 2026-07-23: an
  // oil name spiked with oil on Middle East news; EDGAR saw nothing, so it
  // scored 8/10 as "hype"). Commodity-backed rallies have real fuel and don't
  // mean-revert like single-stock hype — never a top pick.
  if (catalystType === "macro") score = Math.min(score, 4);
  // Pinned tape without a known catalyst: the deal-price signature of a merger
  // announced by press release before any 8-K exists — EDGAR sees nothing, the
  // move would otherwise score 6-7 as "other". A cap only prevents recommending
  // shorts with no payoff; it can't create a bad recommendation.
  if (pinned && !BULLISH_CATALYSTS.has(catalystType)) score = Math.min(score, 3);
  // Applied last and unconditionally — a fresh listing is dangerous to short
  // whatever the catalyst says, and the catalyst caps above are all tighter.
  if (recentListing) score = Math.min(score, RECENT_LISTING_SCORE_CAP);

  return { short_score: score, percent_win_estimate: win };
}
