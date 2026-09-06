// Side-by-side preview of the two prose modes for a real trading day.
//
//   node --env-file=.env.local scripts/thesis-preview.mjs [YYYY-MM-DD]
//
// For each of a day's top-5 theses it prints the template rendering, the model
// rendering, the validator's verdict, and the token/cost of each call. This is
// the gate before flipping AI_PROSE_MODE=model in production: it is the only
// way to see model prose without writing rows or sending the 3:30 email.
//
// Read-only. No ai_analyses writes, no emails, no scanner calls. The one thing
// it does spend is Anthropic tokens — about half a cent for a full run.
//
// It calls modelNarrative() directly rather than generateThesisText(), so it
// works with AI_PROSE_MODE unset: the env flags gate production, not
// inspection. ANTHROPIC_API_KEY still has to be set.
//
//   --model=<id>   preview a different model (cost is reported at its own rate)
//
// FIDELITY CAVEATS — findings are rebuilt from what the drop stored, so:
//   * `tech` is null. RSI and change-from-open aren't persisted, so the
//     template's RSI fallback sentence can't fire here and the model doesn't
//     see them. Everything else matches the real drop exactly.
//   * the base rate is re-read at range_band='ALL'. A drop that resolved a
//     more specific range bucket will show a slightly coarser prior than it did
//     on the day.
// Neither affects what this is for: comparing how the two modes WRITE the same
// findings.

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// USD per million tokens, for the cost line. The default must track
// ANALYSIS_MODEL in lib/quant/thesis.ts; the others are here so --model=
// comparisons report honest cost rather than the default's.
const DEFAULT_MODEL = "claude-sonnet-5"; // must match ANALYSIS_MODEL
const PRICING = {
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "claude-sonnet-5": { in: 2.0, out: 10.0 },
  "claude-opus-5": { in: 5.0, out: 25.0 },
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — this script makes real Anthropic calls.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// ── compile the prose seam so we exercise production logic verbatim ──
// Inside the repo, NOT os.tmpdir(): thesis.ts imports @anthropic-ai/sdk, and
// Node resolves that by walking up from the compiled file to a node_modules —
// which only works if the build sits under the project root.
const build = mkdtempSync(join(process.cwd(), ".thesis-preview-"));
process.on("exit", () => { try { rmSync(build, { recursive: true, force: true }); } catch {} });
console.log("Compiling lib/quant/thesis.ts …");
execFileSync(
  "npx",
  ["tsc", "lib/quant/thesis.ts", "--outDir", build, "--module", "commonjs",
   "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck",
   "--esModuleInterop"],
  { stdio: "inherit" },
);
writeFileSync(join(build, "package.json"), '{"type":"commonjs"}');

// --model=<id> swaps ANALYSIS_MODEL in the COMPILED copy only. Deliberately not
// an env var read by thesis.ts: production has a fail-safe spend posture, and a
// variable that can silently point the drop at a 5x-pricier model works against
// it. Here the blast radius is one preview run.
const modelArg = process.argv.find((a) => a.startsWith("--model="));
if (modelArg) {
  const want = modelArg.slice("--model=".length);
  const built = join(build, "quant", "thesis.js");
  const src = readFileSync(built, "utf8");
  if (!src.includes(`"${DEFAULT_MODEL}"`)) {
    console.error("Could not find ANALYSIS_MODEL in the compiled output.");
    process.exit(1);
  }
  writeFileSync(built, src.replace(`"${DEFAULT_MODEL}"`, JSON.stringify(want)));
  console.log(`Model override: ${want}`);
}
const req = createRequire(import.meta.url);
const { templateThesis, modelNarrative, pinnedSentences } = req(join(build, "quant", "thesis.js"));
const { fetchEarningsSurprise } = req(join(build, "quant", "earnings.js"));

// ── resolve the date ──
let dateKey = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dateKey) {
  const { data } = await db
    .from("ai_analyses").select("date").order("date", { ascending: false }).limit(1);
  dateKey = data?.[0]?.date;
}
if (!dateKey) {
  console.error("No date found in ai_analyses.");
  process.exit(1);
}

const { data: analyses, error: aErr } = await db
  .from("ai_analyses").select("*").eq("date", dateKey).order("rank", { ascending: true });
if (aErr) { console.error("ai_analyses query failed:", aErr.message); process.exit(1); }
if (!analyses?.length) {
  console.error(`No theses stored for ${dateKey}. Pick a date the drop actually ran.`);
  process.exit(1);
}

const { data: gainers } = await db
  .from("daily_gainers").select("*").eq("date", dateKey)
  .in("ticker", analyses.map((a) => a.ticker));
const gainerBy = new Map((gainers ?? []).map((g) => [g.ticker, g]));

const { data: rates } = await db.from("gainer_base_rates").select("*");
function lookupBaseRate(bucket) {
  if (!bucket) return null;
  const hit = (rates ?? []).find(
    (r) => r.cap_band === bucket.cap_band &&
           r.relvol_band === bucket.relvol_band &&
           (r.range_band ?? "ALL") === "ALL",
  );
  if (!hit) return null;
  return {
    ...hit,
    down_rate: Number(hit.down_rate),
    median_next_day_return: hit.median_next_day_return == null ? null : Number(hit.median_next_day_return),
    median_down_move: hit.median_down_move == null ? null : Number(hit.median_down_move),
    median_up_move: hit.median_up_move == null ? null : Number(hit.median_up_move),
  };
}

const activeModel = modelArg ? modelArg.slice("--model=".length) : DEFAULT_MODEL;
const bar = "─".repeat(78);
console.log(`\n${bar}\nTHESIS PREVIEW — ${dateKey} — ${analyses.length} tickers\n${bar}`);

let totalIn = 0, totalOut = 0, accepted = 0;

for (const a of analyses) {
  const g = gainerBy.get(a.ticker);
  const feat = a.features ?? {};
  const findings = {
    g: {
      ticker: a.ticker,
      companyName: a.company_name ?? g?.company_name ?? null,
      exchange: a.exchange ?? g?.exchange ?? null,
      changePercent: g?.change_percent ?? null,
      relativeVolume: g?.relative_volume ?? null,
      marketCap: g?.market_cap ?? null,
      rank: a.rank,
    },
    catalyst: a.catalyst ?? null,
    catalystType: a.catalyst_type ?? "other",
    streakCount: feat.streak_count ?? null,
    baseRate: lookupBaseRate(feat.base_rate_bucket),
    tech: null, // see FIDELITY CAVEATS
    shortScore: a.short_score,
    percentWin: a.percent_win_estimate,
    expectedMove: a.expected_move_percent,
    path: feat.path ?? null,
    listingAgeDays: a.listing_age_days ?? null,
    priorCall: feat.prior_call ?? null,
    // Re-fetched live rather than read back, because the surprise isn't
    // persisted on the row. Mirrors production's gate: EDGAR-confirmed earnings
    // only, which a sec.gov catalyst_url stands in for here.
    earnings:
      a.catalyst_type === "earnings" && (a.catalyst_url ?? "").includes("sec.gov")
        ? await fetchEarningsSurprise(a.ticker, dateKey)
        : null,
  };

  console.log(`\n${bar}`);
  console.log(`#${a.rank}  ${a.ticker}  (${a.company_name ?? "?"})  score ${a.short_score}/10  ${a.catalyst_type}`);
  if (findings.earnings) {
    const e = findings.earnings;
    console.log(`earnings surprise: actual ${e.actual} vs est ${e.estimate} → ${e.verdict} (${e.surprisePercent.toFixed(1)}%), period ${e.period}`);
  } else if (a.catalyst_type === "earnings") {
    console.log("earnings surprise: none (no key, stale period, or not EDGAR-sourced)");
  }
  console.log(`stored model: ${a.model}`);
  console.log(bar);

  console.log("\n── TEMPLATE ──");
  console.log(templateThesis(findings));

  const attempt = await modelNarrative(findings);
  console.log(`\n── ${activeModel.toUpperCase()} ──`);
  if (attempt.text) {
    accepted++;
    console.log([attempt.text, ...pinnedSentences(findings)].join(" "));
    console.log(`\n   [narrative accepted · ${attempt.inputTokens} in / ${attempt.outputTokens} out]`);
  } else {
    console.log(`   REJECTED → would fall back to template.`);
    console.log(`   reason: ${attempt.reason}`);
  }
  if (attempt.inputTokens) totalIn += attempt.inputTokens;
  if (attempt.outputTokens) totalOut += attempt.outputTokens;
}

const price = PRICING[activeModel] ?? PRICING[DEFAULT_MODEL];
if (!PRICING[activeModel]) console.log(`(no price table for ${activeModel} — costing at ${DEFAULT_MODEL} rates)`);
const cost = (totalIn / 1e6) * price.in + (totalOut / 1e6) * price.out;
console.log(`\n${bar}`);
console.log(`${activeModel} · accepted ${accepted}/${analyses.length} · ${totalIn} in / ${totalOut} out tokens`);
console.log(`this run: $${cost.toFixed(5)}   ·   projected 252 sessions: $${(cost * 252).toFixed(2)}/yr`);
console.log(bar + "\n");
