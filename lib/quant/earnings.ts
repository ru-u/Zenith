// Earnings surprise lookup — closes the one hallucination the number validator
// structurally cannot catch.
//
// EDGAR tells us a company reported ("AOUT reported earnings results, 8-K filed
// Sep 3") but not whether the news was GOOD. A thesis then has to explain why a
// stock ripped 44% on earnings from findings that don't say. Both the template
// ("A real earnings beat can keep a stock running") and any prose model are
// pushed toward assuming a beat, because otherwise the spike is unexplained —
// and on 2026-09-04 the model duly wrote "reported earnings results that beat
// expectations", which nothing in the findings supported. It happened to be
// true, which is worse: an unverifiable claim that is usually right is harder
// to catch than one that is usually wrong.
//
// This supplies the missing fact. Once the surprise is IN the findings, the
// claim is grounded, ungroundedNumbers() can verify the figures, and neither
// renderer has to guess.
//
// Free-tier Finnhub, same fail-safe posture as news.ts: no FINNHUB_API_KEY, a
// failed fetch, or anything stale returns null and the thesis simply doesn't
// mention the surprise.

import { withRetry } from "../retry";

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * How far a period label may sit from `dateKey` and still be treated as "the
 * results that moved the stock today". Compared as an absolute distance because
 * Finnhub CALENDARIZES the label: AOUT's fiscal 2027 Q1, reported 2026-09-03,
 * comes back as period "2026-09-30" — a date in the future. ~1.3 quarters is
 * wide enough for that and for the usual weeks-after-quarter-end reporting lag,
 * while still rejecting a company whose last report was a whole quarter ago.
 */
const MAX_PERIOD_AGE_DAYS = 120;

/** Below this the beat/miss is noise, and calling it either would overstate. */
const IN_LINE_PCT = 2;

/**
 * Percentages blow up when the consensus is near zero — AOUT's June quarter is a
 * real 2,649% "beat" on a -$0.005 estimate. True, useless, and it reads as a
 * typo. Under this threshold the clause states both figures and drops the
 * percentage instead.
 */
const MIN_ESTIMATE_FOR_PCT = 0.05;

export interface EarningsSurprise {
  /** Reported EPS. */
  actual: number;
  /** Consensus EPS estimate going in. */
  estimate: number;
  /** Percent difference vs the estimate. Negative = missed. */
  surprisePercent: number;
  /** True when `estimate` is far enough from zero for the percentage to mean
   *  anything; see MIN_ESTIMATE_FOR_PCT. */
  percentMeaningful: boolean;
  /** Finnhub's calendarized quarter label, YYYY-MM-DD. NOT the report date, and
   *  not necessarily the fiscal period end — it may be in the future. */
  period: string;
  /** beat | miss | in_line, after the IN_LINE_PCT deadband. */
  verdict: "beat" | "miss" | "in_line";
}

interface FinnhubEarnings {
  actual?: number | null;
  estimate?: number | null;
  surprisePercent?: number | null;
  period?: string | null;
}

function daysBetween(aKey: string, bKey: string): number {
  const a = Date.parse(`${aKey}T00:00:00Z`);
  const b = Date.parse(`${bKey}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / 86_400_000;
}

/** "$0.42" / "-$0.05" — never "$-0.05". */
function eps(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

/**
 * One clause naming the actual figures, for the "why it moved" sentence.
 * Deliberately states the numbers and stops: whether a beat should keep a stock
 * running is the BEHAVIOR sentence's job, not this one's.
 */
export function earningsSurpriseClause(s: EarningsSurprise): string {
  const vs = `EPS came in at ${eps(s.actual)} against ${eps(s.estimate)} expected`;
  const pct = s.percentMeaningful ? ` a ${Math.abs(s.surprisePercent).toFixed(0)}%` : ` a`;
  if (s.verdict === "in_line") return `${vs} — essentially in line.`;
  if (s.verdict === "beat") return `${vs} —${pct} beat.`;
  return `${vs} —${pct} miss, so today's move isn't coming from the headline number.`;
}

async function fetchEarnings(ticker: string, key: string): Promise<FinnhubEarnings[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const u = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetch(u, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`finnhub returned ${res.status}`);
    const json = (await res.json()) as unknown;
    return Array.isArray(json) ? (json as FinnhubEarnings[]) : [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The most recent earnings surprise for `ticker`, if it is recent enough to be
 * what moved the stock on `dateKey`. Null on anything doubtful.
 *
 * CALL THIS ONLY FOR AN EDGAR-CONFIRMED EARNINGS CATALYST. Finnhub is keyed by
 * bare ticker, and a bare ticker is not an identifier (see CLAUDE.md / the BIOT
 * incident) — this endpoint returns no company name to cross-check, unlike the
 * headlines in news.ts which are guarded by mentionsCompany(). EDGAR's path has
 * already verified the SEC registrant against the scanner's company name via
 * lib/quant/identity.ts, so restricting to it inherits that check rather than
 * inventing a weaker one.
 */
export async function fetchEarningsSurprise(
  ticker: string,
  dateKey: string,
): Promise<EarningsSurprise | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  try {
    const rows = await withRetry(() => fetchEarnings(ticker, key), {
      onRetry: (err, attempt, delay) =>
        console.warn(`[earnings] retry ${attempt} in ${Math.round(delay)}ms:`, (err as Error)?.message),
    });

    // Reported quarters only, newest first. Finnhub also returns UPCOMING
    // quarters (estimate present, actual null); taking row 0 blindly would hand
    // back null for a company that has in fact just reported.
    const reported = rows
      .filter((r) => typeof r.period === "string" && typeof r.actual === "number")
      .sort((a, b) => String(b.period).localeCompare(String(a.period)));
    const latest = reported[0];
    if (!latest?.period) return null;

    if (daysBetween(latest.period, dateKey) > MAX_PERIOD_AGE_DAYS) {
      console.warn(`[earnings] ${ticker}: latest period ${latest.period} too old for ${dateKey} — skipping`);
      return null;
    }

    const actual = latest.actual;
    const estimate = latest.estimate;
    if (typeof actual !== "number" || typeof estimate !== "number") return null;
    if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return null;
    // A zero estimate makes the percentage meaningless (and Finnhub sends null
    // for surprisePercent when it can't compute one).
    if (estimate === 0) return null;

    const surprisePercent =
      typeof latest.surprisePercent === "number" && Number.isFinite(latest.surprisePercent)
        ? latest.surprisePercent
        : ((actual - estimate) / Math.abs(estimate)) * 100;
    if (!Number.isFinite(surprisePercent)) return null;

    const percentMeaningful = Math.abs(estimate) >= MIN_ESTIMATE_FOR_PCT;
    // With an unusable percentage, fall back to the raw EPS difference for the
    // in-line test — a $0.13 actual on a -$0.005 estimate is a beat, not noise.
    const verdict = percentMeaningful
      ? Math.abs(surprisePercent) < IN_LINE_PCT
        ? "in_line"
        : surprisePercent > 0
          ? "beat"
          : "miss"
      : Math.abs(actual - estimate) < 0.01
        ? "in_line"
        : actual > estimate
          ? "beat"
          : "miss";

    return { actual, estimate, surprisePercent, percentMeaningful, period: latest.period, verdict };
  } catch (err) {
    console.warn(`[earnings] ${ticker} lookup failed — thesis will omit the surprise:`, (err as Error).message);
    return null;
  }
}
