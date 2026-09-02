// Backfill catalyst_type over historical_gainers — the sample that makes a
// catalyst Δ re-fit possible at all.
//
// Why this exists: the live record carries only ~12 offerings and 7 regulatory
// filings across 171 scored theses, with zero partnership/meme/macro. Fitting
// D_OFFERING (the largest weight in score.ts) on twelve observations is fitting
// noise. Labelling the 1,919 historical rows turns that into a few hundred per
// class.
//
// TWO LIMITATIONS, BOTH LOAD-BEARING — read before trusting the output:
//
//  1. The BIOT identity guard cannot fire here. `historical_gainers` has no
//     company_name, and namesLikelySameCompany(null, …) returns true, so every
//     CIK match is accepted unverified. This script therefore records the SEC
//     registrant name it matched against in `catalyst_sec_name`, so a wrong
//     attribution stays auditable instead of being silently baked into the fit.
//     Spot-check that column before using the labels.
//  2. The SEC ticker→CIK map is CURRENT, and these rows are up to a year old.
//     A ticker that changed hands (delisting, reuse) resolves to today's
//     registrant, not the one that spiked. Same mitigation: check the name.
//
// Reuses lib/quant/edgar.ts rather than reimplementing it — compiled to a temp
// dir first, since bare node can't import TS. The closure is three files
// (edgar, identity, market-calendar) with no path aliases.
//
//   node --env-file=.env.local scripts/backfill-catalysts.mjs [--limit 50] [--redo]

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;
const REDO = args.includes("--redo");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ua = process.env.SEC_EDGAR_USER_AGENT;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!ua) {
  console.error(
    "SEC_EDGAR_USER_AGENT is required — SEC blocks unidentified clients.\n" +
      'e.g. SEC_EDGAR_USER_AGENT="Zenith Screener you@example.com"',
  );
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── compile the EDGAR module so we reuse production logic verbatim ──
const build = mkdtempSync(join(tmpdir(), "zenith-edgar-"));
process.on("exit", () => { try { rmSync(build, { recursive: true, force: true }); } catch {} });
console.log("Compiling lib/quant/edgar.ts …");
execFileSync(
  "npx",
  ["tsc", "lib/quant/edgar.ts", "--outDir", build, "--module", "commonjs",
   "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
  { stdio: "inherit" },
);
writeFileSync(join(build, "package.json"), '{"type":"commonjs"}');
const { detectCatalyst } = createRequire(import.meta.url)(join(build, "quant", "edgar.js"));

// ── SEC registrant names, for the audit column ──
console.log("Fetching SEC ticker→registrant map …");
const mapRes = await fetch("https://www.sec.gov/files/company_tickers.json", {
  headers: { "user-agent": ua },
});
if (!mapRes.ok) {
  console.error(`SEC map fetch failed: ${mapRes.status}`);
  process.exit(1);
}
const secNames = new Map();
for (const e of Object.values(await mapRes.json())) {
  const t = String(e.ticker || "").toUpperCase();
  if (t && !secNames.has(t)) secNames.set(t, e.title ?? null);
}
console.log(`  ${secNames.size} tickers in the SEC map.`);

// ── rows to label ──
let rows = [];
for (let from = 0; ; from += 1000) {
  let q = supabase
    .from("historical_gainers")
    .select("id, spike_date, ticker, catalyst_type")
    .order("spike_date")
    .range(from, from + 999);
  if (!REDO) q = q.is("catalyst_type", null);
  const { data, error } = await q;
  if (error) { console.error("read error:", error.message); process.exit(1); }
  rows.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}
rows = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
console.log(`\n${rows.length} rows to label.\n`);

// SEC caps at ~10 req/s; detectCatalyst can issue several per ticker, so pace
// conservatively — this run is long by design, not latency-sensitive.
const PACE_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tally = new Map();
let done = 0, failed = 0;
for (const r of rows) {
  try {
    const cat = await detectCatalyst(r.ticker, r.spike_date, null);
    const type = cat?.catalyst_type ?? "none";
    const { error } = await supabase
      .from("historical_gainers")
      .update({
        catalyst_type: type,
        catalyst_sec_name: secNames.get(r.ticker.toUpperCase()) ?? null,
      })
      .eq("id", r.id);
    if (error) { failed++; console.error(`  ${r.ticker}: write failed — ${error.message}`); }
    else tally.set(type, (tally.get(type) ?? 0) + 1);
  } catch (e) {
    failed++;
    console.error(`  ${r.ticker} ${r.spike_date}: ${e?.message}`);
  }
  if (++done % 50 === 0) {
    console.log(`  ${done}/${rows.length} … ${[...tally].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }
  await sleep(PACE_MS);
}

console.log(`\nDone. ${done} processed, ${failed} failed.`);
console.log("Labels written:");
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`);
console.log(
  "\nBefore fitting anything on these: spot-check catalyst_sec_name against the\n" +
    "ticker — the identity guard could not run (see the header).",
);
