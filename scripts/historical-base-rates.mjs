// Phase 2 ingest + precompute — the base-rate table behind every short score.
//
//   node --env-file=.env.local scripts/historical-base-rates.mjs <spike.csv> --join <trades.csv>
//   node --env-file=.env.local scripts/historical-base-rates.mjs --from-db
//   ... DRY RUN by default; pass --apply to actually write (read the note below).
//   ... add --legacy to reproduce the pre-2026-09-11 fit.
//
// READ THIS BEFORE RUNNING IT WITH --apply (2026-09-13).
//
// The "corrected" fit this script produces was BUILT, TESTED AND REJECTED. It is
// kept as an audit tool, and it defaults to --report-only for that reason.
//
// It was replayed against 187 completed thesis-outcomes, paired — same theses,
// same catalysts, same technicals, only the base-rate table swapped (the scoring
// deltas are additive and variant-independent, so the swap is exact). It lost on
// every metric:
//
//                      live      candidate     (realized down-rate 63.1%)
//     mean predicted   55.4%       51.6%
//     Brier           0.2454      0.2594
//     skill           -0.054      -0.114
//     AUC              0.563       0.523
//     win-rate >=8   73% (n=41)  63% (n=16)
//
// Two things that kills. First, the live table under-predicts (55.4% stated
// against 63.1% realized) and the correction moves it FURTHER down, away from
// reality. Second, dropping the relvol rungs costs most of the discrimination --
// AUC 0.563 -> 0.523, near-random -- which means the Yahoo relvol carries real
// signal despite disagreeing with the scanner's band 45% of the time. The two
// are numerically different but rank-correlated enough to be informative.
//
// The pool is built wrong and works anyway. Do not "fix" it again without
// re-running scripts/calibration.mjs and a paired replay first; the mechanism
// below is right and the conclusion it invites is wrong.
//
// The replacement pool is board_outcomes (lib/quant/outcomes.ts), captured
// forward on the live universe. Revisit when it has the sample.
//
// ── what the rewrite was FOR (all still true, just not decisive) ──
//
//   1. SOURCE MISMATCH. historical_gainers.market_cap and .relative_volume came
//      from a Yahoo scrape (yahoo_spike_metrics.csv). Production buckets on the
//      TradingView scanner's numbers (daily_gainers). Across the 343 rows where
//      both sources exist the Yahoo cap runs a median 1.55x the scanner's (p90
//      18.3x) and lands the row in a DIFFERENT capBand() 34.4% of the time;
//      relvolBand() disagrees 45% of the time. So a third of the pool was filed
//      under a cap bucket, and nearly half under a relvol bucket, that the live
//      lookup never asks for. This is not about which source is truthful — the
//      fit and the lookup simply have to use the same one.
//
//   2. WRONG UNIVERSE. On 2026-09-08 the board gained previous-close floors
//      (MIN_PRICE $3, MIN_MARKET_CAP $25M, isGameEligible). Nothing re-fit these
//      rates, so ~52% of the pool describes stocks the board can no longer list.
//      Correcting both at once moves the global down-rate 61.6% -> 56.4%.
//
// WHAT CHANGED. The fit now keys on scanner figures joined in from the
// prototype's own board export (mcap_all_trades.csv: `changepercent`,
// `marketcap`), applies the real previous-close eligibility test, and emits
// NO RELVOL RUNGS AT ALL — the scanner relvol exists for only 343 rows, so that
// dimension cannot be keyed correctly and is dropped rather than keyed wrong.
// resolveBaseRate() walks past a missing rung on its own; no app change needed.
//
// The cost is honest and large: ~512 eligible rows, and the nano band collapses
// to n=18 (the $25M floor plus non-inflated caps leaves almost nothing under
// $50M). Most lookups will land on cap x range or global. That is the correct
// amount of confidence for this data — see board_outcomes, which accumulates
// the replacement pool forward at ~100 rows/session.
//
// Banding thresholds MUST match lib/baseRates.ts (capBand/rangeBand).

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── args ──
const argv = process.argv.slice(2);
let csvPath = null;
let tradesPath = null;
const flags = new Set();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--join") tradesPath = argv[++i];
  else if (a.startsWith("--")) flags.add(a);
  else csvPath = a;
}
const fromDb = flags.has("--from-db");
// Writes require an explicit --apply. The default is a dry run because the fit
// this produces was measured as WORSE than what is live (see the header).
const apply = flags.has("--apply");
const reportOnly = !apply;
const legacy = flags.has("--legacy");

if (!csvPath && !fromDb) {
  console.error(
    "usage: node --env-file=.env.local scripts/historical-base-rates.mjs " +
      "<spike.csv> [--join <trades.csv>] | --from-db  [--apply] [--legacy]\n" +
      "  (dry run unless --apply; see the header for why)",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── banding (keep in sync with lib/baseRates.ts) ──
function capBand(mc) {
  if (mc == null || !Number.isFinite(mc)) return null;
  if (mc < 50e6) return "nano";
  if (mc < 300e6) return "micro";
  if (mc < 2e9) return "small";
  return "mid";
}
// Tertile cuts of the historical day_range_pct distribution — MIRRORED from
// lib/baseRates.ts (RANGE_T1 / RANGE_T2). Keep the two in sync. Deliberately NOT
// re-derived from the filtered subset: one variable at a time, and the report
// prints what the new tertiles would be so that call can be made on numbers.
const RANGE_T1 = 30.1;
const RANGE_T2 = 53.9;
function rangeBand(p) {
  if (p == null || !Number.isFinite(p)) return null;
  if (p < RANGE_T1) return "r_lo";
  if (p < RANGE_T2) return "r_mid";
  return "r_hi";
}
function relvolBand(rv) {
  if (rv == null || !Number.isFinite(rv)) return null;
  if (rv < 5) return "rv_lt5";
  if (rv < 20) return "rv_5_20";
  if (rv < 100) return "rv_20_100";
  return "rv_100plus";
}

// ── eligibility (keep in sync with lib/marketdata/normalize.ts) ──
// The floors are measured on the PREVIOUS close because that is what DECA
// measures, and the scrape's price/cap are the spike day's — so back them out,
// exactly as previousSessionFigures() does. FLOOR_EPSILON is not optional: a
// $3.00 close up exactly 10% comes back as 2.9999999999999996.
const MIN_PRICE = 3;
const MIN_MARKET_CAP = 25_000_000;
const FLOOR_EPSILON = 1e-6;
function isGameEligible(spikeClose, changePercent, scannerCap) {
  if (spikeClose == null || changePercent == null || scannerCap == null) return false;
  const factor = 1 + changePercent / 100;
  if (!Number.isFinite(factor) || factor <= 0) return false;
  return (
    spikeClose / factor >= MIN_PRICE * (1 - FLOOR_EPSILON) &&
    scannerCap / factor >= MIN_MARKET_CAP * (1 - FLOOR_EPSILON)
  );
}

// 1-10 score band — MIRRORED from winToScore() in lib/quant/score.ts, so the
// report can say what a bucket change actually does to a published score.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const winToScore = (w) => Math.round(clamp(1 + ((w - 20) * 9) / 60, 1, 10));

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
// Wilson 95% interval — the report's whole point. A bucket's down_rate is a
// proportion off a small n, and the old table published single integers off
// intervals ~24 points wide.
function wilson(k, n) {
  if (!n) return [0, 0];
  const p = k / n, z = 1.96, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * (c - h), 100 * (c + h)];
}

// Minimal RFC-4180 parser: gainers-export style files quote company names that
// contain commas ("Inhibrx Biosciences, Inc."), which split(",") silently
// corrupts into shifted columns.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// ── from-db mode ──
if (fromDb) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("historical_gainers")
      .select(
        "next_day_return, market_cap, market_cap_scanner, change_percent, relative_volume, day_range_pct, spike_close",
      )
      .range(from, from + 999);
    if (error) {
      console.error("historical_gainers read error:", error.message);
      process.exit(1);
    }
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  console.log(`Loaded ${all.length} rows from historical_gainers.`);
  await computeAndWriteBaseRates(all);
  process.exit(0);
}

// ── parse the spike CSV (the label + the intraday range) ──
const spikeRows = parseCsv(readFileSync(csvPath, "utf8"));
const need = ["spike_trading_date", "ticker", "next_day_return", "marketcap_yahoo", "relvol_30d"];
for (const c of need) {
  if (!(c in (spikeRows[0] ?? {}))) {
    console.error(`CSV missing required column: ${c}. Found: ${Object.keys(spikeRows[0] ?? {}).join(", ")}`);
    process.exit(1);
  }
}

// ── parse the trades CSV (scanner change% + scanner cap) and index it ──
// Join key is the SCRAPE date (`date`), not `spike_trading_date`: the trades
// export is keyed the same way the board was, one row per ticker per scrape.
const trades = new Map();
if (tradesPath) {
  for (const t of parseCsv(readFileSync(tradesPath, "utf8"))) {
    trades.set(`${t.date}|${t.ticker}`, t);
  }
  console.log(`Loaded ${trades.size} scanner-keyed trade rows from ${tradesPath}.`);
}

const rows = [];
let skipped = 0, joined = 0;
for (const p of spikeRows) {
  const ndr = num(p.next_day_return);
  const mc = num(p.marketcap_yahoo);
  const rv = num(p.relvol_30d);
  const ticker = (p.ticker || "").trim();
  const spikeDate = (p.spike_trading_date || "").trim();
  if (ndr == null || mc == null || rv == null || !ticker || !spikeDate) {
    skipped++;
    continue;
  }
  const t = trades.get(`${p.date}|${ticker}`);
  if (t) joined++;
  rows.push({
    spike_date: spikeDate,
    ticker,
    spike_close: num(p.spike_close),
    day_range_pct: num(p.day_range_pct),
    next_date: (p.next_date || "").trim() || null,
    next_close: num(p.next_close),
    next_day_return: ndr,
    next_day_down: ndr < 0,
    market_cap: mc,
    relative_volume: rv,
    sector: p.sector?.trim() || null,
    industry: p.industry?.trim() || null,
    // Null for rows the trades export doesn't cover. Those rows stay in the
    // table (backfill-catalysts.mjs labelled all of them and that sample is not
    // reproducible) but are excluded from the fit.
    change_percent: t ? num(t.changepercent) : null,
    market_cap_scanner: t ? num(t.marketcap) : null,
  });
}
console.log(
  `Parsed ${rows.length} rows (${skipped} skipped for missing label/cap/relvol); ` +
    `${joined} joined to scanner figures (${(100 * joined / rows.length).toFixed(1)}%).`,
);

if (!reportOnly) {
  const seen = new Set();
  const deduped = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const k = `${rows[i].spike_date}|${rows[i].ticker}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(rows[i]);
  }
  for (let i = 0; i < deduped.length; i += 500) {
    const { error } = await supabase
      .from("historical_gainers")
      .upsert(deduped.slice(i, i + 500), { onConflict: "spike_date,ticker" });
    if (error) {
      console.error("historical_gainers upsert error:", error.message);
      process.exit(1);
    }
  }
  console.log(`Ingested ${deduped.length} unique rows into historical_gainers.`);
}

await computeAndWriteBaseRates(rows);

// ─────────────────────────────────────────────────────────────────────────────
async function computeAndWriteBaseRates(all) {
  // ── select the fit population ──
  const withLabel = all.filter((r) => r.next_day_return != null);
  let fit, describe;
  if (legacy) {
    fit = withLabel.filter((r) => r.market_cap != null && r.relative_volume != null);
    describe = "LEGACY: Yahoo-keyed, unfiltered (pre-2026-09-11 behaviour)";
  } else {
    const keyed = withLabel.filter(
      (r) => r.market_cap_scanner != null && r.change_percent != null,
    );
    fit = keyed.filter((r) => isGameEligible(r.spike_close, r.change_percent, r.market_cap_scanner));
    describe = "scanner-keyed + live-eligible";
    console.log(
      `\nFit population: ${withLabel.length} labelled -> ${keyed.length} scanner-keyed ` +
        `-> ${fit.length} live-eligible (${describe}).`,
    );
  }
  if (fit.length === 0) {
    console.error("Fit population is empty — refusing to write.");
    process.exit(1);
  }
  const capOf = (r) => (legacy ? r.market_cap : r.market_cap_scanner);

  // ── bucket ──
  // Rungs must cover every level resolveBaseRate() walks that we intend to fill:
  //   cap|ALL|rg -> cap|ALL|ALL -> ALL|ALL|rg -> ALL|ALL|ALL
  // The relvol rungs (cap|rv|rg, cap|rv|ALL) are deliberately NOT emitted unless
  // --legacy: the scanner relvol exists for 343 rows and disagrees with the
  // Yahoo one on 45% of bands, so keying them would be worse than missing them.
  // resolveBaseRate() falls through a missing rung by itself.
  const groups = new Map();
  const add = (k, r) => {
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { n: 0, down: 0, returns: [] }));
    g.n++;
    if (r.next_day_return < 0) g.down++;
    g.returns.push(r.next_day_return);
  };
  for (const r of fit) {
    const cb = capBand(capOf(r));
    const gb = rangeBand(r.day_range_pct);
    const rb = legacy ? relvolBand(r.relative_volume) : null;
    if (cb && rb && gb) add(`${cb}|${rb}|${gb}`, r);
    if (cb && rb) add(`${cb}|${rb}|ALL`, r);
    if (cb && gb) add(`${cb}|ALL|${gb}`, r);
    if (cb) add(`${cb}|ALL|ALL`, r);
    if (gb) add(`ALL|ALL|${gb}`, r);
    add("ALL|ALL|ALL", r);
  }
  const baseRates = [...groups.entries()].map(([k, g]) => {
    const [cap_band, relvol_band, range_band] = k.split("|");
    return {
      cap_band, relvol_band, range_band,
      n: g.n,
      down_rate: g.down / g.n,
      median_next_day_return: median(g.returns),
      median_down_move: median(g.returns.filter((x) => x < 0)),
      median_up_move: median(g.returns.filter((x) => x >= 0)),
    };
  });

  // ── before/after ──
  const { data: prior } = await supabase.from("gainer_base_rates").select("*");
  const priorMap = new Map(
    (prior ?? []).map((r) => [`${r.cap_band}|${r.relvol_band}|${r.range_band}`, r]),
  );
  const key = (r) => `${r.cap_band}|${r.relvol_band}|${r.range_band}`;
  console.log(`\n── before → after (${describe}) ──`);
  console.log(
    "  bucket                       n_old →  n_new    down_old → down_new    score    95% CI (new)",
  );
  const seenKeys = new Set();
  for (const r of baseRates.sort((a, b) => b.n - a.n)) {
    seenKeys.add(key(r));
    const p = priorMap.get(key(r));
    const [lo, hi] = wilson(Math.round(r.down_rate * r.n), r.n);
    const oldPct = p ? `${(100 * p.down_rate).toFixed(1)}%` : "   —  ";
    const oldSc = p ? winToScore(100 * p.down_rate) : "—";
    const newSc = winToScore(100 * r.down_rate);
    const thin = r.n < 30 ? "  <MIN_N" : "";
    console.log(
      `  ${key(r).padEnd(26)} ${String(p?.n ?? "—").padStart(5)} → ${String(r.n).padStart(5)}` +
        `    ${oldPct.padStart(7)} → ${(100 * r.down_rate).toFixed(1).padStart(5)}%` +
        `    ${String(oldSc).padStart(2)}→${String(newSc).padStart(2)}` +
        `    [${lo.toFixed(1)}, ${hi.toFixed(1)}]${thin}`,
    );
  }
  const dropped = (prior ?? []).filter((p) => !seenKeys.has(key(p)));
  if (dropped.length) {
    console.log(`\n  DROPPED (${dropped.length} buckets no longer emitted):`);
    for (const d of dropped.sort((a, b) => b.n - a.n).slice(0, 12)) {
      console.log(`    ${key(d).padEnd(26)} was n=${String(d.n).padStart(4)} down=${(100 * d.down_rate).toFixed(1)}%`);
    }
    if (dropped.length > 12) console.log(`    ... and ${dropped.length - 12} more`);
  }

  // What the range tertiles WOULD be on this population — printed, not applied.
  const ranges = fit.map((r) => r.day_range_pct).filter((x) => x != null).sort((a, b) => a - b);
  if (ranges.length > 10) {
    const t = (p) => ranges[Math.floor(p * (ranges.length - 1))].toFixed(1);
    console.log(
      `\n  Range tertiles on this population: ${t(1 / 3)} / ${t(2 / 3)} ` +
        `(in use: ${RANGE_T1} / ${RANGE_T2} — unchanged this round)`,
    );
  }

  // ── pre-flight ──
  // resolveBaseRate() returns ALL|ALL|ALL unconditionally as its last resort; if
  // that rung is missing, every lookup returns null, score.ts falls to
  // FALLBACK_WIN = 50 and formatBaseRatePrior() drops the base-rate sentence
  // from every thesis — silently. Never write a table that can do that.
  const global = baseRates.find((r) => key(r) === "ALL|ALL|ALL");
  if (!global || global.n < 100) {
    console.error(`\nREFUSING TO WRITE: global rung ${global ? `n=${global.n}` : "missing"} (need >= 100).`);
    process.exit(1);
  }
  const usable = baseRates.filter((r) => r.n >= 30).length;
  console.log(
    `\n  ${baseRates.length} buckets, ${usable} at or above MIN_N=30, global n=${global.n} ` +
      `down=${(100 * global.down_rate).toFixed(1)}% (score ${winToScore(100 * global.down_rate)}).`,
  );

  if (reportOnly) {
    console.log("\nDry run — nothing written. Pass --apply to write (read the header first).");
    return;
  }

  // ── write ──
  // The delete/insert pair is not transactional, so the old contents go to disk
  // first: an insert that fails after the delete leaves the table EMPTY, which
  // degrades silently rather than loudly (see the pre-flight note above).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dump = `/tmp/gainer_base_rates.${stamp}.json`;
  writeFileSync(dump, JSON.stringify(prior ?? [], null, 2));
  console.log(`\nBacked up ${(prior ?? []).length} existing buckets to ${dump}`);

  const { error: delErr } = await supabase
    .from("gainer_base_rates")
    .delete()
    .not("cap_band", "is", null);
  if (delErr) {
    console.error("gainer_base_rates clear error:", delErr.message);
    console.error(`Table may be EMPTY. Restore from ${dump} or re-run.`);
    process.exit(1);
  }
  const { error: insErr } = await supabase.from("gainer_base_rates").insert(baseRates);
  if (insErr) {
    console.error("gainer_base_rates insert error:", insErr.message);
    console.error(`TABLE IS NOW EMPTY — scoring will fall back to 50%. Restore from ${dump}.`);
    process.exit(1);
  }

  const { count } = await supabase
    .from("gainer_base_rates")
    .select("*", { count: "exact", head: true });
  if (count !== baseRates.length) {
    console.error(`VERIFY FAILED: wrote ${baseRates.length}, table holds ${count}. Check ${dump}.`);
    process.exit(1);
  }
  console.log(`Wrote and verified ${count} base-rate buckets.`);
}
