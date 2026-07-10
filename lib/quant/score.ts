// Deterministic next-day short scoring — pure functions, no I/O.
//
// percent_win_estimate starts from the empirical base rate (realized "closed
// lower next session" frequency for this cap×relvol bucket) and applies the
// catalyst/technical adjustments below. The Δ constants are the whole tuning
// surface: they mirror the heuristics the old LLM prompt encoded in prose
// (buyouts pin, offerings fade, real news runs, squeezes are wild) and are
// meant to be re-fit from stored `quant-v1` rows vs realized next-day returns.

import type { GainerRow } from "../marketdata/types";
import type { BaseRate } from "../baseRates";
import type { Technicals } from "./technicals";

// ── tuning surface (Δs are percentage points on percent_win_estimate) ──
const D_OFFERING = 8; // dilution → fade-prone
const D_EARNINGS = -5; // genuine results can keep running
const D_REGULATORY = -5; // genuine FDA/clinical wins can keep running
const D_PARTNERSHIP = -3;
const BUYOUT_WIN_CEILING = 20; // pinned near deal price — shorts rarely win
const MEME_PULL_TO_50 = 0.5; // squeeze variance: pull this fraction toward a coin flip
const D_RSI_OVERBOUGHT = 4; // daily RSI above RSI_OVERBOUGHT
const RSI_OVERBOUGHT = 80;
const D_FADING_INTRADAY = 3; // already selling off since the open
const D_BELOW_VWAP = 2; // buyers underwater on the day
const D_NEAR_52W_HIGH = -2; // breakout strength — riskier short
const NEAR_52W_BAND = 0.02;
const D_PARABOLIC = 2; // +100% day — exhaustion beyond what relvol captures
const PARABOLIC_CHANGE_PCT = 100;
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

export function scoreShort(
  g: GainerRow,
  streakCount: number | null,
  baseRate: BaseRate | null,
  catalystType: string,
  tech: Technicals | null,
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

  if (g.changePercent != null && g.changePercent >= PARABOLIC_CHANGE_PCT) win += D_PARABOLIC;
  if (streakCount != null && streakCount > 1) win += D_STREAK_PER_DAY * (streakCount - 1);

  if (catalystType === "buyout") win = Math.min(win, BUYOUT_WIN_CEILING);
  win = clamp(Math.round(win), WIN_FLOOR, WIN_CEILING);

  let score = winToScore(win);
  // Risk caps by catalyst regardless of the win math (mirrors the old rules:
  // a pinned buyout is never an attractive short; squeezes are too wild).
  if (catalystType === "buyout") score = Math.min(score, 2);
  if (catalystType === "meme_squeeze") score = Math.min(score, 4);

  return { short_score: score, percent_win_estimate: win };
}
