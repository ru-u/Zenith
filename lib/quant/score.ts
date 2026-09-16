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
// Re-fit 2026-09-04 against 1,919 catalyst-labelled historical sessions
// (scripts/backfill-catalysts.mjs), the first sample large enough to ESTIMATE
// these rather than merely fail to reject them. Baseline is the 'none' class,
// 62.1% down (n=1,384). Label quality audited at ~0.3% identity error.
//
//   offering  63.8% down (n=199)  -> +1.8pp vs none, t=0.48
//   earnings  52.9% down (n=261)  -> -9.2pp vs none
//
// D_OFFERING was +8, which the live record had already contradicted twice
// (realized 53.8% against a predicted 70.3%). Offerings fade barely more than
// an unexplained spike — the dilution story is real but it was worth about a
// quarter of what this model claimed, and +8 amounted to using the top of the
// confidence interval as a point estimate.
//
// Caveat carried deliberately: the historical 'none' baseline is 62.1% while
// the live 'other' class runs 69.7%, so these are different universes. Relative
// Δs transfer better than levels, but scripts/calibration.mjs is what will say
// whether they transferred at all.
//
// D_REGULATORY is knowingly NOT re-fit. Its point estimate came back +8.6pp —
// the opposite sign to the -5 below — but on n=41 with a CI still containing
// the baseline, flipping a sign is a bigger claim than the data supports.
const D_OFFERING = 2; // dilution → mildly fade-prone (was 8; see above)
const D_EARNINGS = -9; // genuine results keep running (was -5; understated)
const D_REGULATORY = -5; // genuine FDA/clinical wins can keep running — see the re-fit note above
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
// D_PARABOLIC removed. Its note used to claim magnitude "now enters through the
// base-rate range band". AUDITED 2026-09-15: that is FALSE, and the whole path
// was traced so nobody re-derives it from the claim —
//   * scoreShort reads only g.price off the row, never g.changePercent;
//   * resolveBaseRate keys on marketCap, relativeVolume and dayRangePct
//     (intraday high−low), none of which is the session gain;
//   * catalystType is text regex over EDGAR filings and Finnhub headlines;
//   * tech.changeFromOpen is % since TODAY'S OPEN, and is read as a sign test.
// Magnitude enters scoring at exactly ONE point in the repo: the ≥15%
// PINNED_MIN_CHANGE_PCT floor gating the pinned-tape cap (lib/quant/features.ts).
// That is a floor on a cap, not a graded term — the other two pinned conditions
// are scale-free ratios. Nothing in this file can see how far the stock ran.
//
// The range band does not stand in for it. It was fit on historical_gainers,
// whose change_percent is NULL on all 1,919 rows, so the substitution was never
// testable there. Live (Sep 2026, the first month a range band actually
// resolved): 24 r_lo / 11 r_mid / 1 r_hi — 67% in one "tertile", because the fit
// population was the pre-floor board of penny stocks up 50-300%. Spike size
// overlaps almost completely across the bands: r_lo spans 10.9-50.4%, r_mid
// 12.0-75.0%, corr(band, spike %) = +0.30 on n=35.
//
// Magnitude is real and it is NOT in the win math. Across 206 theses with a
// finalized spike % and a next-day outcome, corr(spike %, short P&L) = +0.21
// (+0.34 within catalyst='other', n=106) while corr(spike %, short_score) =
// -0.02. But it is a PAYOFF effect, not a probability one: win rate by spike
// band is flat (67/59/60/59/74%) while the average WIN grows monotonically
// (+7.0/+7.1/+9.4/+16.9/+23.7%). So it must NOT become a Δ on `win`, which
// winToScore treats as a probability — that is exactly the BUYOUT_WIN_CEILING
// mistake (a payoff intuition encoded as a probability drove Brier skill
// negative). Its home is a magnitude dimension on gainer_base_rates feeding
// median_down_move/median_up_move -> expectedMovePercent. THAT HALF IS STILL
// BLOCKED: board_outcomes carries change_percent but records FORWARD and was
// still empty at this audit.
//
// THE Δ PROHIBITION STANDS. Only the cap channel opened — see
// MIN_SPIKE_FOR_TOP_SCORE below, shipped 2026-09-16. A cap runs after
// winToScore and never touches percent_win_estimate, so it buys ranking without
// spending calibration; a Δ on `win` would spend both. The first cap tried here
// was sub-20% capped at 6, and it was REJECTED on the numbers: it fires twice in
// 42 days and moves the top pick from +368.0% to +364.6%, i.e. slightly worse
// than doing nothing. Do not resurrect it — the effect lives at the TOP of the
// score range, not the bottom of the magnitude range.
//
// Magnitude floor for a top-end score. The engine has no edge at 8+ on a modest
// mover, and the gap is widest exactly where the product is loudest:
//
//   score 9+ & spike <35%   n= 9  56% win  MEAN -1.86%   <- negative
//   score 9+ & spike >=35%  n=13  69% win  mean +11.91%
//   score 8+ & spike <35%   n=25  64% win  mean  +2.02%
//   score 8+ & spike >=35%  n=22  77% win  mean +14.06%
//
// Trigger was RFAI 2026-09-15: scored 9/10 at +26.1% intraday, closed +13.5%
// (rank 4 -> rank 10 on the finalized board), traded +30.4% the next session.
//
// Three things that look arbitrary and are not:
//   * 35 is NOT a fitted optimum. The top-pick backtest is flat across the whole
//     usable range — 25% and 30% both give +398.5%, 35% gives +400.2%, 40% gives
//     +400.9%, against +365.6% uncapped. 35 was chosen for how much of the score
//     distribution it spends (it turns 53% of all 8+ scores into 7s), not for a
//     backtest edge it does not have over 30.
//   * The 9+ cell is n=9. That is the whole empirical case for the top end, and
//     it is the same order of sample that made D_OFFERING = +8 wrong. Re-check it
//     before widening this, and prefer moving the threshold DOWN over up.
//   * It reads the ~3:30 intraday figure, the only one that exists at scoring
//     time. The cells above were measured on the FINALIZED close. The two
//     diverge — RFAI was 26.1% vs 13.5% — so this cap is keyed on a different
//     number than the evidence for it. RFAI clears neither, but a fade-into-the
//     -close name can. That gap is entry-price drift, and it is not fixed here.
const MIN_SPIKE_FOR_TOP_SCORE = 35;
const MODEST_SPIKE_SCORE_CAP = 7;
//
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
  // Modest movers never carry a top-end score — see MIN_SPIKE_FOR_TOP_SCORE. The
  // ONLY place this file reads how far the stock ran, and deliberately a cap
  // rather than a Δ: `win` above is already final, so percent_win_estimate (and
  // therefore expectedMovePercent and every calibration metric) is untouched.
  // Fails open on a missing change_percent, matching the technical Δs.
  if (g.changePercent != null && g.changePercent < MIN_SPIKE_FOR_TOP_SCORE) {
    score = Math.min(score, MODEST_SPIKE_SCORE_CAP);
  }
  // Applied last and unconditionally — a fresh listing is dangerous to short
  // whatever the catalyst says, and the catalyst caps above are all tighter.
  if (recentListing) score = Math.min(score, RECENT_LISTING_SCORE_CAP);

  return { short_score: score, percent_win_estimate: win };
}
