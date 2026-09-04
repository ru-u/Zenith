// Calibration report — is percent_win_estimate an honest probability?
//
// The scoring loop already records realized outcomes (lib/quant/outcomes.ts),
// but nothing ever read them back to ask whether the engine's stated confidence
// means anything. This is that check, and it separates two things that are
// easy to conflate:
//
//   DISCRIMINATION (AUC) — does a higher score rank a winner above a loser?
//   CALIBRATION (Brier / reliability) — when it says 64%, does 64% happen?
//
// An engine can rank well and still state nonsense probabilities, and that is
// exactly the failure this found: AUC ~0.59 (real, modest signal) with a
// NEGATIVE skill score (the probabilities are worse than always guessing the
// base rate). Ranking is fixed by re-ordering; calibration is fixed by moving
// the constants toward what actually happened.
//
//   node --env-file=.env.local scripts/calibration.mjs [--since 2026-08-31]
//
// Note on --since: outcomes recorded before 2026-08-31 were measured against a
// 15-minute-delayed feed (fixed in 226c510), which shifts returns by ~1% and
// can flip a marginal win/loss. Pass --since to restrict to clean labels once
// enough have accumulated.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

let q = supabase
  .from("ai_analyses")
  .select("date, ticker, short_score, percent_win_estimate, outcome_win, catalyst_type")
  .not("percent_win_estimate", "is", null)
  .not("outcome_win", "is", null)
  .order("date");
if (since) q = q.gte("date", since);

const { data, error } = await q;
if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}
const rows = data ?? [];
if (rows.length < 20) {
  console.log(`Only ${rows.length} scored outcomes${since ? ` since ${since}` : ""} — too few to calibrate.`);
  process.exit(0);
}

console.log(`Calibration over ${rows.length} scored theses, ${rows[0].date} → ${rows[rows.length - 1].date}\n`);

// Wilson interval — the normal approximation is unusable at these bucket sizes.
function wilson(k, n) {
  const p = k / n, z = 1.96, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * (c - h), 100 * (c + h)];
}

// ── reliability ───────────────────────────────────────────────────────────
console.log("RELIABILITY — predicted vs realized");
console.log("band        n    predicted   realized   gap        95% CI");
const BANDS = [[0, 50], [50, 56], [56, 60], [60, 64], [64, 70], [70, 101]];
for (const [lo, hi] of BANDS) {
  const b = rows.filter((r) => r.percent_win_estimate >= lo && r.percent_win_estimate < hi);
  if (b.length < 5) {
    console.log(`${`${lo}-${hi}`.padEnd(12)}${String(b.length).padStart(3)}   (too few)`);
    continue;
  }
  const pred = b.reduce((a, r) => a + r.percent_win_estimate, 0) / b.length;
  const k = b.filter((r) => r.outcome_win).length;
  const real = (100 * k) / b.length;
  const [cl, ch] = wilson(k, b.length);
  const gap = real - pred;
  console.log(
    `${`${lo}-${hi}`.padEnd(12)}${String(b.length).padStart(3)}   ${pred.toFixed(1).padStart(7)}%   ${real.toFixed(1).padStart(7)}%  ${((gap >= 0 ? "+" : "") + gap.toFixed(1)).padStart(7)}pp   [${cl.toFixed(1)}, ${ch.toFixed(1)}]`,
  );
}

// ── scoring rules ─────────────────────────────────────────────────────────
const base = rows.filter((r) => r.outcome_win).length / rows.length;
const brier = rows.reduce((a, r) => a + (r.percent_win_estimate / 100 - (r.outcome_win ? 1 : 0)) ** 2, 0) / rows.length;
const brierBase = rows.reduce((a, r) => a + (base - (r.outcome_win ? 1 : 0)) ** 2, 0) / rows.length;
const skill = 1 - brier / brierBase;

function auc(items, key) {
  const pos = items.filter((r) => r.outcome_win);
  const neg = items.filter((r) => !r.outcome_win);
  if (!pos.length || !neg.length) return NaN;
  let c = 0;
  for (const p of pos) for (const n of neg) c += p[key] > n[key] ? 1 : p[key] === n[key] ? 0.5 : 0;
  return c / (pos.length * neg.length);
}

console.log(`\nDISCRIMINATION`);
console.log(`  AUC, short_score          ${auc(rows, "short_score").toFixed(3)}`);
console.log(`  AUC, percent_win_estimate ${auc(rows, "percent_win_estimate").toFixed(3)}   (0.5 = no ranking ability)`);
console.log(`\nCALIBRATION`);
console.log(`  Brier                     ${brier.toFixed(4)}`);
console.log(`  Brier, always ${(100 * base).toFixed(1)}%       ${brierBase.toFixed(4)}`);
console.log(`  Skill score               ${skill.toFixed(4)}   ${skill > 0 ? "(beats a constant)" : "<-- WORSE THAN A CONSTANT"}`);
const predAll = rows.reduce((a, r) => a + r.percent_win_estimate, 0) / rows.length;
console.log(`  Mean predicted            ${predAll.toFixed(1)}%`);
console.log(`  Mean realized             ${(100 * base).toFixed(1)}%   -> ${((100 * base - predAll >= 0 ? "+" : "") + (100 * base - predAll).toFixed(1))}pp`);

// ── per-constant gaps: where a hand-set number is provably wrong ──────────
console.log(`\nPER-CATALYST — each row is a constant in score.ts meeting reality`);
console.log("catalyst        n    predicted   realized   gap        95% CI on realized");
const by = new Map();
for (const r of rows) {
  const k = r.catalyst_type ?? "null";
  const g = by.get(k) ?? { n: 0, w: 0, p: 0 };
  g.n++; g.w += r.outcome_win ? 1 : 0; g.p += r.percent_win_estimate;
  by.set(k, g);
}
for (const [k, g] of [...by].sort((a, b) => b[1].n - a[1].n)) {
  const pred = g.p / g.n, real = (100 * g.w) / g.n, gap = real - pred;
  const [cl, ch] = wilson(g.w, g.n);
  const flag = g.n >= 10 && (pred < cl || pred > ch) ? "  <-- predicted value is outside the CI" : "";
  console.log(
    `${k.padEnd(14)}${String(g.n).padStart(3)}   ${pred.toFixed(1).padStart(7)}%   ${real.toFixed(1).padStart(7)}%  ${((gap >= 0 ? "+" : "") + gap.toFixed(1)).padStart(7)}pp   [${cl.toFixed(1)}, ${ch.toFixed(1)}]${flag}`,
  );
}
console.log(
  "\nA flagged row means the data rejects the constant currently in score.ts — not\n" +
    "that the realized figure is the right replacement. At these sample sizes the\n" +
    "interval is what to move toward, not the point estimate.",
);
