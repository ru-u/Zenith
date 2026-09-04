// Calibration drift check — the recurring half of the feedback loop.
//
// scripts/calibration.mjs is the rich report a human reads; this is the narrow
// question a cron can ask every month: has any hand-set constant in score.ts
// drifted far enough from realized outcomes that the data now REJECTS it?
//
// "Rejects" is deliberately strict — the predicted value must fall outside the
// Wilson interval on what actually happened. A gap alone is not enough. That
// standard is what kept the September pass from re-fitting D_OFFERING on twelve
// observations, and it is what caught BUYOUT_WIN_CEILING, which predicted 20.0%
// against a realized 50.0% (n=14, CI [26.8, 73.2]) and was single-handedly
// driving the engine's Brier skill score negative.
//
// Silent when nothing is flagged. An alert here means a constant needs a human
// decision, not that the engine should adjust itself.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

/** Below this a catalyst class can't reject anything; the interval is too wide. */
const MIN_FLAG_N = 10;

export interface CalibrationRow {
  catalyst_type: string;
  n: number;
  predicted: number;
  realized: number;
  ci_low: number;
  ci_high: number;
  /** The data rejects the constant currently producing `predicted`. */
  flagged: boolean;
}

export interface CalibrationResult {
  total: number;
  /** Brier score of percent_win_estimate as a probability. */
  brier: number;
  /** Brier of always predicting the overall realized rate. */
  brier_baseline: number;
  /** 1 - brier/baseline. Negative means the probabilities are worse than a constant. */
  skill: number;
  mean_predicted: number;
  mean_realized: number;
  rows: CalibrationRow[];
  flagged: CalibrationRow[];
}

/** Wilson score interval, in percent. The normal approximation is unusable here. */
export function wilson(k: number, n: number): [number, number] {
  const p = k / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * (centre - half), 100 * (centre + half)];
}

/**
 * Compare every catalyst class's stated win probability against what happened.
 * Returns null when there is not enough recorded outcome data to say anything.
 */
export async function checkCalibration(
  admin: SupabaseClient<Database>,
  opts: { since?: string } = {},
): Promise<CalibrationResult | null> {
  let q = admin
    .from("ai_analyses")
    .select("percent_win_estimate, outcome_win, catalyst_type")
    .not("percent_win_estimate", "is", null)
    .not("outcome_win", "is", null);
  if (opts.since) q = q.gte("date", opts.since);

  const { data, error } = await q;
  if (error) {
    console.error("[calibration] query failed:", error.message);
    return null;
  }
  const rows = data ?? [];
  if (rows.length < 30) return null;

  const wins = rows.filter((r) => r.outcome_win).length;
  const base = wins / rows.length;
  const brier =
    rows.reduce(
      (a, r) => a + ((r.percent_win_estimate as number) / 100 - (r.outcome_win ? 1 : 0)) ** 2,
      0,
    ) / rows.length;
  const brierBaseline =
    rows.reduce((a, r) => a + (base - (r.outcome_win ? 1 : 0)) ** 2, 0) / rows.length;

  const groups = new Map<string, { n: number; w: number; p: number }>();
  for (const r of rows) {
    const key = r.catalyst_type ?? "unclassified";
    const g = groups.get(key) ?? { n: 0, w: 0, p: 0 };
    g.n++;
    g.w += r.outcome_win ? 1 : 0;
    g.p += r.percent_win_estimate as number;
    groups.set(key, g);
  }

  const out: CalibrationRow[] = [...groups.entries()]
    .map(([catalyst_type, g]) => {
      const predicted = g.p / g.n;
      const realized = (100 * g.w) / g.n;
      const [ci_low, ci_high] = wilson(g.w, g.n);
      return {
        catalyst_type,
        n: g.n,
        predicted,
        realized,
        ci_low,
        ci_high,
        flagged: g.n >= MIN_FLAG_N && (predicted < ci_low || predicted > ci_high),
      };
    })
    .sort((a, b) => b.n - a.n);

  return {
    total: rows.length,
    brier,
    brier_baseline: brierBaseline,
    skill: 1 - brier / brierBaseline,
    mean_predicted: rows.reduce((a, r) => a + (r.percent_win_estimate as number), 0) / rows.length,
    mean_realized: 100 * base,
    rows: out,
    flagged: out.filter((r) => r.flagged),
  };
}

/** Human-readable body for the ops email. */
export function formatCalibrationBody(res: CalibrationResult): string {
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const lines = [
    `${res.total} scored theses with recorded outcomes.`,
    ``,
    `Mean predicted ${pct(res.mean_predicted)} vs realized ${pct(res.mean_realized)}.`,
    `Brier ${res.brier.toFixed(4)} vs ${res.brier_baseline.toFixed(4)} for always guessing the base rate.`,
    `Skill ${res.skill.toFixed(4)}${res.skill < 0 ? "  <-- probabilities are worse than a constant" : ""}`,
    ``,
    `FLAGGED — the data rejects the constant currently producing these:`,
  ];
  for (const r of res.flagged) {
    lines.push(
      `  ${r.catalyst_type}: predicted ${pct(r.predicted)}, realized ${pct(r.realized)} ` +
        `(n=${r.n}, 95% CI [${r.ci_low.toFixed(1)}, ${r.ci_high.toFixed(1)}])`,
    );
  }
  lines.push(
    ``,
    `All classes:`,
    ...res.rows.map(
      (r) =>
        `  ${r.catalyst_type.padEnd(14)} n=${String(r.n).padStart(4)}  ` +
        `pred ${pct(r.predicted).padStart(6)}  real ${pct(r.realized).padStart(6)}  ` +
        `CI [${r.ci_low.toFixed(1)}, ${r.ci_high.toFixed(1)}]${r.flagged ? "  <-- FLAGGED" : ""}`,
    ),
    ``,
    `A flag means the constant needs a human decision, not that the realized figure`,
    `is the right replacement — at these sample sizes the interval is what to move`,
    `toward, not the point estimate. Full report:`,
    `  node --env-file=.env.local scripts/calibration.mjs`,
  );
  return lines.join("\n");
}
