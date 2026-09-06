// The pluggable prose seam. The quant engine produces structured findings;
// this turns them into the `short_thesis`. Default is a $0 deterministic
// template. AI_PROSE_MODE=model swaps in one plain Anthropic call (no tools,
// no web search) over the SAME findings — a config flip, not a rewrite — and
// falls back to the template on any failure.
//
// The split matters. The model writes ONLY the narrative half (why it spiked, how
// that catalyst class behaves). Every sentence carrying a figure or a risk
// disclosure — the new-listing warning, our own prior call, the base rate, the
// expected move — is appended verbatim by pinnedSentences() and never passes
// through the model. Two reasons:
//
//   1. Those sentences exist as reader-safety obligations (see the comments on
//      listingSentence and priorCallSentence). An earlier version of this file
//      handed the model a 14-key subset of the findings that omitted listingAgeDays
//      and priorCall entirely, so switching modes silently DROPPED both
//      warnings for exactly the cases they were written for.
//   2. expectedMoveSentence ends in either "in the short's favor" or "which
//      does NOT favor a short". A paraphrase that flips that sign is a
//      materially wrong call shown to a high-schooler.
//
// What the model does write is then checked by ungroundedNumbers() — any figure
// that doesn't trace back to one the engine computed discards the whole
// attempt. That check, not the prompt, is what keeps /engine honest when it
// says a model never "produce[s] or adjust[s] the short score, the base rate,
// or any figure".

import Anthropic from "@anthropic-ai/sdk";
import type { GainerRow } from "../marketdata/types";
import { formatBaseRatePrior, type BaseRate } from "../baseRates";
import { RECENT_LISTING_DAYS } from "./listing";
import type { PriorCall } from "./features";
import type { Technicals } from "./technicals";
import type { PathFeatures } from "./features";
import { earningsSurpriseClause, type EarningsSurprise } from "./earnings";

/**
 * The prose model. Sonnet 5 over Haiku 4.5 (2026-09-05) on measured behaviour,
 * not on principle: on the same day's findings Haiku asserted "earnings results
 * that beat expectations" from a catalyst that never said so, and invented a
 * fade tendency for the `other` class where the engine deliberately claims no
 * direction. Sonnet declined both — "there isn't a clear pattern to point to for
 * how this type of move tends to play out". At five calls a day the difference
 * is ~$1.30/yr vs ~$4.10/yr, so quality is the only axis that matters here.
 *
 * NO SAMPLING PARAMS. The 4.6-and-later generation removed `temperature` /
 * `top_p` / `top_k` and rejects them with a 400. Since every failure here
 * degrades silently to the template, adding one back would look like nothing
 * happened while 100% of prose quietly stopped being model-written.
 */
export const ANALYSIS_MODEL = "claude-sonnet-5";

/** Per-call ceiling. The SDK default is 600s — in the pre-close path that means
 *  one hung call silently delays the 3:30 drop past the point it is useful. */
const PROSE_TIMEOUT_MS = 12_000;

/** Narrative only (the pinned sentences are appended, not generated), so this
 *  is generous. It also bounds spend: cost cannot drift up without changing it. */
const PROSE_MAX_TOKENS = 500;

/**
 * Whole-batch ceiling for prose. The five calls run sequentially, AFTER EDGAR's
 * 8s-per-ticker budget, inside a single cron invocation. When this is spent the
 * remaining tickers render from the template rather than pushing the email late
 * — a templated thesis that arrives before the close beats a model-written one that
 * doesn't.
 */
export const PROSE_BUDGET_MS = 20_000;

// One client per process, built lazily: app/engine/page.tsx imports this module
// purely for activeProseMode(), and that must never require an API key.
let sdk: Anthropic | null = null;
function anthropic(): Anthropic {
  // maxRetries 1, not the SDK's default 2 — the batch deadline is the real
  // ceiling, and lib/retry.ts must NOT be layered on top of this or the two
  // retry budgets multiply.
  sdk ??= new Anthropic({ timeout: PROSE_TIMEOUT_MS, maxRetries: 1 });
  return sdk;
}

/**
 * Kill switch for ALL Anthropic calls (spend). Since the quant engine took
 * over generation, this gates ONLY the optional model prose mode — off by
 * default, so a fresh environment or an exhausted credit balance can never
 * spend. The quant pipeline itself is free and runs regardless.
 */
export function aiThesesEnabled(): boolean {
  return process.env.AI_THESES_ENABLED === "true";
}

/**
 * The prose mode actually in effect ("model" requires the spend switch too).
 *
 * The enabling value is `model`, not a model name: it was `haiku` until the
 * 2026-09-05 switch to Sonnet 5, at which point an env var named after last
 * month's model would have been actively misleading. Safe to rename because the
 * mode has never been enabled in any environment.
 */
export function activeProseMode(): "template" | "model" {
  return process.env.AI_PROSE_MODE === "model" && aiThesesEnabled() ? "model" : "template";
}

export interface ThesisFindings {
  g: GainerRow;
  /** Human catalyst sentence from EDGAR, or null when nothing was on file. */
  catalyst: string | null;
  catalystType: string;
  streakCount: number | null;
  baseRate: BaseRate | null;
  tech: Technicals | null;
  shortScore: number;
  percentWin: number;
  /** Probability-weighted expected next-day move, % (lib/baseRates.ts). */
  expectedMove: number | null;
  /** Price-path/levels context for the chart sentence (lib/quant/features.ts). */
  path: PathFeatures | null;
  /** Days of trading history, when short enough to matter (lib/quant/listing.ts). */
  listingAgeDays: number | null;
  /** Zenith's own last call on this ticker (lib/quant/features.ts). */
  priorCall: PriorCall | null;
  /**
   * Actual vs consensus EPS, when EDGAR confirmed an earnings catalyst and
   * Finnhub had a recent enough period (lib/quant/earnings.ts). Null for every
   * other catalyst type. This is the fact that stops both renderers having to
   * guess whether the results were good.
   */
  earnings: EarningsSurprise | null;
}

/**
 * One sentence situating today's move on the recent graph — recovery into a
 * traded range vs price discovery vs pressing a prior peak. Display-only and
 * direction-neutral: it teaches the chart shape, it does not predict from it
 * (whether these shapes fade differently is a September calibration question).
 */
/**
 * A new listing gets said out loud, because the alternative is worse than
 * silence: TradingView computes its performance windows over whatever bars
 * exist, so a stock with four sessions still reports a three-month range, and
 * levelContextSentence would confidently describe "a range it already traded
 * this quarter" that never existed.
 */
function listingSentence(f: ThesisFindings): string | null {
  const days = f.listingAgeDays;
  if (days == null || days > RECENT_LISTING_DAYS) return null;
  const when =
    days <= 7 ? "in the last week" : days <= 14 ? "in the last two weeks" : "within the last month";
  return `This only started trading ${when}, so there's no real price history behind it — no prior levels, no established range, and a thin float that can move violently in either direction. New listings are dangerous to short whatever the odds say, so the score is capped here.`;
}

/**
 * Zenith's own last call on this name, said plainly.
 *
 * Deliberately not a scoring input: repeat calls after a losing one still won
 * 70% of the time (mean +4.4%), so a prior miss is not evidence the next call
 * is worse. What it IS is information the reader needs — re-entering after a
 * call went against you means adding to a losing position, and that is a
 * sizing decision only the reader can make.
 */
function priorCallSentence(f: ThesisFindings): string | null {
  const p = f.priorCall;
  if (!p || p.realized_percent == null) return null;
  const when = p.sessions_ago === 1 ? "yesterday" : `on ${p.date}`;
  const moved = Math.abs(p.realized_percent).toFixed(1);
  if (p.realized_percent < 0) {
    return `Worth knowing: Zenith called this a ${p.score}/10 short ${when} and it closed ${moved}% HIGHER — that call went against the short. Shorting it again means adding to a position that has already moved against you, so size it accordingly.`;
  }
  return `Zenith also called this a ${p.score}/10 short ${when}, and it closed ${moved}% lower — that call worked.`;
}

/**
 * How this catalyst class behaves over one next-day hold.
 *
 * Earnings is the one class where we may know more than the class: with an
 * actual beat/miss in hand, the generic "a real earnings beat can keep a stock
 * running" is either an overclaim or backwards. BEHAVIOR.earnings is the
 * unknown-surprise fallback.
 */
function behaviorSentence(f: ThesisFindings): string | null {
  const e = f.earnings;
  if (f.catalystType === "earnings" && e) {
    if (e.verdict === "beat") {
      return "That is a genuine beat, and beats can keep a stock running for another day — a riskier short than the size of the move suggests.";
    }
    if (e.verdict === "miss") {
      return "The stock is up despite missing, so whatever is driving today isn't the reported numbers — and there's no earnings strength underneath to keep it going.";
    }
    return "The numbers landed about where the street expected, so there's no earnings surprise underneath this move to carry it further.";
  }
  return BEHAVIOR[f.catalystType] ?? null;
}

function levelContextSentence(f: ThesisFindings): string | null {
  const p = f.path;
  if (!p) return null;
  // Levels need history to mean anything; see listingSentence.
  if (f.listingAgeDays != null && f.listingAgeDays <= RECENT_LISTING_DAYS) return null;
  const headroom = p.headroom_to_prior_peak_pct;
  if (p.is_new_high_3m) {
    return "On the chart this is price discovery — today's spike took it above everything it's traded in the past three months, so there's no prior level overhead.";
  }
  if (headroom != null && headroom >= 8 && p.retracement_fraction != null && p.retracement_fraction >= 0.25) {
    // headroom is upside TO the peak; convert to the % the price sits BELOW it
    // (e.g. 115% of upside = 54% below the peak) so the sentence reads true.
    const below = Math.round((headroom / (100 + headroom)) * 100);
    return `On the chart this is a recovery, not a breakout — it's climbing back into a range it already traded this quarter, still ~${below}% below that prior peak.`;
  }
  if (headroom != null && headroom >= 0 && headroom < 3) {
    return "On the chart it's pressing right up against its recent peak — the level where sellers showed up before.";
  }
  return null;
}

/** The payoff line: what a fade typically gives back vs what a run costs. */
function expectedMoveSentence(f: ThesisFindings): string | null {
  const r = f.baseRate;
  if (f.expectedMove == null || r?.median_down_move == null || r?.median_up_move == null) {
    return null;
  }
  const em = f.expectedMove;
  const down = Math.abs(r.median_down_move * 100).toFixed(1);
  const up = Math.abs(r.median_up_move * 100).toFixed(1);
  return `Sizing the payoff: when this setup fades it typically gives back ~${down}%, and when it keeps running it typically adds ~${up}% — netting out to an expected ${em >= 0 ? "+" : ""}${em.toFixed(1)}% next-day move${em < 0 ? " in the short's favor" : ", which does NOT favor a short"}.`;
}

// One plain "how this catalyst type behaves over a single next-day hold" line
// per class — the same behavioral priors the old prompt spelled out.
const BEHAVIOR: Record<string, string> = {
  buyout:
    "Buyout stocks get pinned near the announced deal price, so they almost never drop the next day — a bad short despite the big move.",
  offering:
    "Pops tied to share offerings usually fade once the dilution sinks in, which makes this a fade-friendly setup.",
  // Only used when the surprise is UNKNOWN — see behaviorSentence().
  earnings:
    "A real earnings beat can keep a stock running for another day, so this is a riskier short than the move suggests.",
  regulatory:
    "Genuine regulatory or clinical wins can keep running, so shorting this is riskier than the move suggests.",
  partnership:
    "Real partnership or contract news can hold its gains, so be careful shorting it.",
  meme_squeeze:
    "Squeeze moves are violent in both directions — dangerous to short even when a fade feels obvious.",
  macro:
    "Careful with the usual fade play: sector-wide moves have real fuel behind them, and they don't give it back the way single-stock hype spikes do.",
};

/** The $0 deterministic rendering. Exported for scripts/thesis-preview.mjs, which
 *  shows it side by side with the model one. Sentence order is production output
 *  — do not reorder it to match the model path. */
export function templateThesis(f: ThesisFindings): string {
  const { g, tech } = f;
  const sentences: string[] = [];

  // 1 — why it moved (plus the actual figures, when we have them).
  if (f.catalyst) {
    sentences.push(f.catalyst.endsWith(".") ? f.catalyst : `${f.catalyst}.`);
    if (f.earnings) sentences.push(earningsSurpriseClause(f.earnings));
  } else {
    const pct = g.changePercent != null ? `${g.changePercent.toFixed(0)}%` : "big";
    const rv =
      g.relativeVolume != null && g.relativeVolume >= 2
        ? ` on ${Math.round(g.relativeVolume)}x its normal volume`
        : "";
    sentences.push(
      `${g.ticker} jumped ${pct} today${rv} with no fresh SEC filing behind the move — that usually means momentum or hype rather than hard news.`,
    );
  }

  // 2 — what that catalyst type does over a single next-day hold.
  const behavior = behaviorSentence(f);
  if (behavior) {
    sentences.push(behavior);
  } else if (tech?.rsi != null && tech.rsi > 80) {
    sentences.push(
      `It also looks stretched (RSI ${Math.round(tech.rsi)}${
        tech.changeFromOpen != null && tech.changeFromOpen < 0 ? ", already fading since the open" : ""
      }), and stretched no-news runners tend to mean-revert.`,
    );
  } else {
    sentences.push(
      "Nothing forces it to fade tomorrow, so lean on the historical odds rather than the size of the move.",
    );
  }

  // 3 — where today's move sits on the recent graph (recovery vs discovery),
  // or, for a new listing, the fact that there is no graph to sit on.
  const listing = listingSentence(f);
  if (listing) sentences.push(listing);
  const level = levelContextSentence(f);
  if (level) sentences.push(level);

  // 3b — our own record on this exact name, win or lose.
  const prior = priorCallSentence(f);
  if (prior) sentences.push(prior);

  // 4 — the empirical odds (+ streak context when notable).
  const baseRateLine = formatBaseRatePrior(f.baseRate);
  if (baseRateLine) sentences.push(baseRateLine);

  // 5 — the payoff, which is what the game actually grades.
  const payoff = expectedMoveSentence(f);
  if (payoff) sentences.push(payoff);

  if (f.streakCount != null && f.streakCount > 1) {
    sentences.push(`It has now topped the gainers list ${f.streakCount} days in a row.`);
  }

  return sentences.join(" ");
}

/**
 * The sentences a model never gets to touch, in the order they are appended
 * after its narrative. Every one of them either carries an exact figure or
 * discharges a disclosure obligation; see the file header for why.
 *
 * Deliberately NOT used by templateThesis — that function's sentence order is
 * production output and stays exactly as it was.
 */
export function pinnedSentences(f: ThesisFindings): string[] {
  return [
    listingSentence(f),
    priorCallSentence(f),
    formatBaseRatePrior(f.baseRate),
    expectedMoveSentence(f),
  ].filter((s): s is string => Boolean(s));
}

// Matches 1,500 / $4.10 / 34.2% / -3.1 — the shapes figures actually take in
// this prose.
const NUMBER_RE = /-?\$?\d[\d,]*(?:\.\d+)?%?/g;

function numbersIn(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(NUMBER_RE)) {
    const n = Number(m[0].replace(/[$,%]/g, ""));
    if (Number.isFinite(n)) out.push(Math.abs(n));
  }
  return out;
}

/**
 * Returns the figures in `text` that don't trace back to something the engine
 * computed. Empty array = clean.
 *
 * Compared on absolute value, because direction is carried by words at least as
 * often as by a minus sign ("gives back 4.2%"), and signed matching produces
 * false rejections. That is safe here only because the pinned sentences own
 * every claim where the direction is the point.
 *
 * Bare integers 1-10 pass unconditionally: they are ordinals, day counts and
 * "top five" far more often than they are data, and every figure that actually
 * matters (a win rate, a percentage move, a share price) falls outside that
 * range or is in `allowed` anyway.
 */
function ungroundedNumbers(text: string, allowed: number[]): number[] {
  const bad: number[] = [];
  for (const n of numbersIn(text)) {
    if (Number.isInteger(n) && n <= 10) continue;
    const ok = allowed.some(
      (a) =>
        Math.abs(a - n) < 0.05 ||
        Math.abs(Math.round(a) - n) < 0.05 ||
        Math.abs(Number(a.toFixed(1)) - n) < 0.05,
    );
    if (!ok) bad.push(n);
  }
  return bad;
}

const PROSE_SYSTEM = [
  "You rewrite pre-computed stock findings into plain prose for a high-school student playing the DECA Stock Market Game. Assume they are new to markets.",
  "",
  "Write 2-3 sentences answering exactly two things: why this stock spiked today, and how that kind of catalyst usually behaves over a single next-day hold.",
  "",
  "Hard rules:",
  "- Your text is a PREFIX. Sentences covering the historical odds, the expected next-day move, the stock's trading history and Zenith's own past call on it are appended after yours automatically. Those topics are not yours: do not state a win rate, a base rate, a sample size, an expected move, a percentage of past cases, or a prior call — not even in passing.",
  "- Use only figures present in the findings. Never invent a number and never restate one inexactly.",
  "- Always say how far the stock moved today, using change_percent. That is the single fact the reader most needs and it must not be left out.",
  "- Say only what the findings say. If the catalyst says the company \"reported earnings results\" and no earnings_surprise is given, do NOT write that it beat, missed, topped or exceeded anything — you do not know whether the news was good. When earnings_surprise IS given, use its figures and say plainly whether it was a beat or a miss.",
  "- Do not characterise a trial, approval or filing outcome as positive or negative unless the findings say so.",
  "- `catalyst_behavior` describes how this CLASS of event behaves in general. It is not a fact about this company — never convert it into one. (Its earnings note mentions a \"real earnings beat\"; that does not mean this company beat.)",
  "- If `catalyst_behavior` is null, the engine is deliberately making no claim about which way this one tends to go. Say nothing about how it \"tends\" to behave — describe what happened and stop.",
  "- Never give advice, predict a price, or tell the reader what to do.",
  "- No preamble, no headings, no bullet points, no closing summary. Prose sentences only.",
  "- Plain language. No jargon, no hedging boilerplate.",
].join("\n");

export interface ProseAttempt {
  /** The narrative, or null if the attempt was discarded. */
  text: string | null;
  /** Why it was discarded — surfaced by scripts/thesis-preview.mjs and the logs. */
  reason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * One Anthropic call for the narrative half. Never throws; every failure path
 * returns `text: null` with a reason, and the caller falls back to the template.
 *
 * Exported so the preview harness can exercise it with AI_PROSE_MODE unset —
 * the env flags gate production, not inspection.
 */
export async function modelNarrative(
  f: ThesisFindings,
  deadline: number = Number.POSITIVE_INFINITY,
): Promise<ProseAttempt> {
  const miss = (reason: string): ProseAttempt => ({
    text: null,
    reason,
    inputTokens: null,
    outputTokens: null,
  });

  const remaining = deadline - Date.now();
  if (remaining < 2_000) return miss("prose budget spent");

  const catalystText =
    f.catalyst ??
    "No SEC filing found — the move looks like momentum or hype rather than hard news.";
  const chartContext = levelContextSentence(f);

  try {
    const findings = {
      ticker: f.g.ticker,
      company: f.g.companyName,
      change_percent: f.g.changePercent,
      relative_volume: f.g.relativeVolume,
      catalyst: catalystText,
      catalyst_type: f.catalystType,
      // The same behavioural prior the template uses. Passing the sentence
      // rather than the bare class keeps one source of truth for what each
      // catalyst type does over a next-day hold.
      catalyst_behavior: behaviorSentence(f),
      // Rounded to cents before the model sees them: handed the raw values it
      // writes "an expected loss of $0.2448", which is both ugly and a
      // precision the consensus never had.
      earnings_surprise: f.earnings
        ? {
            actual_eps: Number(f.earnings.actual.toFixed(2)),
            estimate_eps: Number(f.earnings.estimate.toFixed(2)),
            surprise_percent: f.earnings.percentMeaningful
              ? Number(f.earnings.surprisePercent.toFixed(1))
              : null,
            verdict: f.earnings.verdict,
          }
        : null,
      streak_days: f.streakCount,
      rsi: f.tech?.rsi ?? null,
      change_from_open_percent: f.tech?.changeFromOpen ?? null,
      chart_context: chartContext,
    };
    const pinned = pinnedSentences(f);

    const res = await anthropic().messages.create(
      {
        model: ANALYSIS_MODEL,
        max_tokens: PROSE_MAX_TOKENS,
        system: PROSE_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              `Findings: ${JSON.stringify(findings)}`,
              "",
              pinned.length
                ? `ALREADY COVERED — these are appended verbatim after your text. Do not restate any of it:\n${pinned.map((s) => `- ${s}`).join("\n")}`
                : "Nothing is appended after your text.",
            ].join("\n"),
          },
        ],
      },
      { timeout: Math.min(PROSE_TIMEOUT_MS, remaining) },
    );

    const inputTokens = res.usage.input_tokens;
    const outputTokens = res.usage.output_tokens;
    // Single-line JSON so Railway logs stay greppable, same shape as seclog.
    console.log(
      JSON.stringify({
        kind: "model_prose",
        ticker: f.g.ticker,
        in: inputTokens,
        out: outputTokens,
        stop: res.stop_reason,
      }),
    );
    const spent = (reason: string): ProseAttempt => ({
      text: null,
      reason,
      inputTokens,
      outputTokens,
    });

    // A truncated thesis is a half-sentence. The old code published it.
    if (res.stop_reason === "max_tokens") return spent("truncated at max_tokens");

    const text = res.content.find((b) => b.type === "text")?.text.trim();
    if (!text || text.length < 40) return spent("empty or too short");

    const allowed = [
      f.g.changePercent,
      f.g.relativeVolume,
      f.tech?.rsi,
      f.tech?.changeFromOpen,
      f.streakCount,
      ...numbersIn(catalystText),
      ...numbersIn(chartContext ?? ""),
      ...(f.earnings
        ? [
            f.earnings.actual,
            f.earnings.estimate,
            f.earnings.surprisePercent,
            // The cent-rounded forms are what the model is actually given, and
            // ungroundedNumbers()'s tolerance only covers 0dp/1dp roundings.
            Number(f.earnings.actual.toFixed(2)),
            Number(f.earnings.estimate.toFixed(2)),
          ]
        : []),
      // Every figure the engine itself publishes. A model that correctly
      // restates the base rate is off-brief (the prompt forbids it, and the
      // sentence is appended anyway) but it has not FABRICATED anything, and
      // this validator exists to catch fabrication. Leaving these out rejected
      // every attempt on the first live run.
      ...pinned.flatMap((p) => numbersIn(p)),
    ]
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      .map(Math.abs);

    const bad = ungroundedNumbers(text, allowed);
    if (bad.length) return spent(`ungrounded figures: ${bad.join(", ")}`);

    return { text, reason: null, inputTokens, outputTokens };
  } catch (err) {
    return miss((err as Error).message);
  }
}

export type ProseSource = "template" | "model";

export interface ProseResult {
  text: string;
  /** What actually produced this text — NOT what AI_PROSE_MODE asked for. The
   *  stored `model` column is derived from this, so a silent fallback can never
   *  be recorded as a model row. */
  source: ProseSource;
}

/**
 * Thesis prose from structured findings — template by default, the model behind
 * the flag. `deadline` is an epoch-ms budget shared across a whole batch.
 */
export async function generateThesisText(
  f: ThesisFindings,
  deadline: number = Number.POSITIVE_INFINITY,
): Promise<ProseResult> {
  if (activeProseMode() === "model") {
    const attempt = await modelNarrative(f, deadline);
    if (attempt.text) {
      return { text: [attempt.text, ...pinnedSentences(f)].join(" "), source: "model" };
    }
    console.warn(`[thesis] model prose for ${f.g.ticker} — using template: ${attempt.reason}`);
  }
  return { text: templateThesis(f), source: "template" };
}
