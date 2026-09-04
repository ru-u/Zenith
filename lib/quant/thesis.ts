// The pluggable prose seam. The quant engine produces structured findings;
// this turns them into the 2-3 sentence `short_thesis`. Default is a $0
// deterministic template. AI_PROSE_MODE=haiku swaps in one plain Anthropic
// call (no tools, no web search) over the SAME findings — a config flip, not
// a rewrite — and silently falls back to the template on any failure.

import Anthropic from "@anthropic-ai/sdk";
import type { GainerRow } from "../marketdata/types";
import { formatBaseRatePrior, type BaseRate } from "../baseRates";
import { RECENT_LISTING_DAYS } from "./listing";
import type { PriorCall } from "./features";
import type { Technicals } from "./technicals";
import type { PathFeatures } from "./features";

export const ANALYSIS_MODEL = "claude-haiku-4-5";

/**
 * Kill switch for ALL Anthropic calls (spend). Since the quant engine took
 * over generation, this gates ONLY the optional Haiku prose mode — off by
 * default, so a fresh environment or an exhausted credit balance can never
 * spend. The quant pipeline itself is free and runs regardless.
 */
export function aiThesesEnabled(): boolean {
  return process.env.AI_THESES_ENABLED === "true";
}

/** The prose mode actually in effect (haiku requires the spend switch too). */
export function activeProseMode(): "template" | "haiku" {
  return process.env.AI_PROSE_MODE === "haiku" && aiThesesEnabled() ? "haiku" : "template";
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

function templateThesis(f: ThesisFindings): string {
  const { g, tech } = f;
  const sentences: string[] = [];

  // 1 — why it moved.
  if (f.catalyst) {
    sentences.push(f.catalyst.endsWith(".") ? f.catalyst : `${f.catalyst}.`);
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
  const behavior = BEHAVIOR[f.catalystType];
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

async function haikuThesis(f: ThesisFindings): Promise<string | null> {
  try {
    const client = new Anthropic();
    const findings = {
      ticker: f.g.ticker,
      company: f.g.companyName,
      change_percent: f.g.changePercent,
      relative_volume: f.g.relativeVolume,
      catalyst: f.catalyst ?? "no SEC filing found — likely momentum/hype",
      catalyst_type: f.catalystType,
      streak_days: f.streakCount,
      base_rate: formatBaseRatePrior(f.baseRate),
      rsi: f.tech?.rsi,
      change_from_open_percent: f.tech?.changeFromOpen,
      short_score_1_to_10: f.shortScore,
      percent_win_estimate: f.percentWin,
      expected_next_day_move_percent: f.expectedMove,
      chart_context: levelContextSentence(f),
    };
    const res = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            "Write a 2-3 sentence next-day short thesis for a DECA Stock Market Game student (a high-schooler new to markets). Plain language, no jargon, no hedging boilerplate.",
            "State why the stock spiked, how that kind of catalyst usually behaves over one next-day hold, and the odds. Do NOT change any numbers or invent facts beyond these findings.",
            "",
            `Findings: ${JSON.stringify(findings)}`,
          ].join("\n"),
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text")?.text.trim();
    return text || null;
  } catch (err) {
    console.warn(`[thesis] haiku prose failed for ${f.g.ticker} — using template:`, (err as Error).message);
    return null;
  }
}

/** Thesis prose from structured findings — template by default, Haiku behind the flag. */
export async function generateThesisText(f: ThesisFindings): Promise<string> {
  if (activeProseMode() === "haiku") {
    const text = await haikuThesis(f);
    if (text) return text;
  }
  return templateThesis(f);
}
