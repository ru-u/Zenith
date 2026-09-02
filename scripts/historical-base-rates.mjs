// Phase 2 ingest + precompute.
//   1. Reads the prototype top-gainer CSV (with next-day price) into historical_gainers.
//   2. Precomputes "closed lower next day" base rates by cap×relvol bucket
//      (+ cap-only + global) into gainer_base_rates — including the conditional
//      medians (typical move when down / when up) behind expected_move_percent.
//
// Run from the repo root with the service-role key available:
//   node --env-file=.env.local scripts/historical-base-rates.mjs <path-to-csv>
//   node --env-file=.env.local scripts/historical-base-rates.mjs --from-db
//
// --from-db skips the CSV ingest and recomputes the buckets from the
// historical_gainers rows already in the database (e.g. after adding columns).
//
// Banding thresholds MUST match lib/baseRates.ts (capBand/relvolBand).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error(
    "usage: node --env-file=.env.local scripts/historical-base-rates.mjs <csv | --from-db>",
  );
  process.exit(1);
}
const fromDb = csvPath === "--from-db";

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
// lib/baseRates.ts (RANGE_T1 / RANGE_T2). Keep the two in sync.
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

// ── from-db mode: recompute buckets from rows already ingested ──
if (fromDb) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("historical_gainers")
      .select("next_day_return, next_day_down, market_cap, relative_volume, day_range_pct")
      .range(from, from + 999);
    if (error) {
      console.error("historical_gainers read error:", error.message);
      process.exit(1);
    }
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const usable = all.filter(
    (r) => r.next_day_return != null && r.market_cap != null && r.relative_volume != null,
  );
  console.log(`Loaded ${usable.length} usable rows from historical_gainers.`);
  await computeAndWriteBaseRates(usable);
  process.exit(0);
}

// ── parse CSV ──
const text = readFileSync(csvPath, "utf8");
const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
const header = lines[0].split(",");
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const need = ["spike_trading_date", "ticker", "next_day_return", "marketcap_yahoo", "relvol_30d"];
for (const c of need) {
  if (idx[c] == null) {
    console.error(`CSV missing required column: ${c}. Found: ${header.join(", ")}`);
    process.exit(1);
  }
}
const industryIdx = idx["industry"]; // assumed last text col; may contain commas

const rows = [];
let skipped = 0;
for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(",");
  const ndr = num(p[idx.next_day_return]);
  const mc = num(p[idx.marketcap_yahoo]);
  const rv = num(p[idx.relvol_30d]);
  const ticker = (p[idx.ticker] || "").trim();
  const spikeDate = (p[idx.spike_trading_date] || "").trim();
  if (ndr == null || mc == null || rv == null || !ticker || !spikeDate) {
    skipped++;
    continue;
  }
  rows.push({
    spike_date: spikeDate,
    ticker,
    spike_close: num(p[idx.spike_close]),
    day_range_pct: num(p[idx.day_range_pct]),
    next_date: (p[idx.next_date] || "").trim() || null,
    next_close: num(p[idx.next_close]),
    next_day_return: ndr,
    next_day_down: ndr < 0,
    market_cap: mc,
    relative_volume: rv,
    sector: idx.sector != null ? (p[idx.sector] || "").trim() || null : null,
    industry:
      industryIdx != null
        ? (p.slice(industryIdx).join(",").trim() || null) // overflow → industry
        : null,
  });
}
console.log(`Parsed ${rows.length} rows (${skipped} skipped for missing label/cap/relvol).`);

// ── ingest historical_gainers (dedup on spike_date,ticker; last wins) ──
const seen = new Set();
const deduped = [];
for (let i = rows.length - 1; i >= 0; i--) {
  const k = `${rows[i].spike_date}|${rows[i].ticker}`;
  if (seen.has(k)) continue;
  seen.add(k);
  deduped.push(rows[i]);
}
for (let i = 0; i < deduped.length; i += 500) {
  const chunk = deduped.slice(i, i + 500);
  const { error } = await supabase
    .from("historical_gainers")
    .upsert(chunk, { onConflict: "spike_date,ticker" });
  if (error) {
    console.error("historical_gainers upsert error:", error.message);
    process.exit(1);
  }
}
console.log(`Ingested ${deduped.length} unique rows into historical_gainers.`);

// ── precompute base rates ──
await computeAndWriteBaseRates(rows);
console.log("Done.");

// Bucket + write, shared by the CSV and --from-db paths. `next_day_down` is
// recomputed from the return so both row shapes behave identically.
async function computeAndWriteBaseRates(rows) {
  const groups = new Map(); // key -> { n, down, returns[] }
  function add(key, row) {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { n: 0, down: 0, returns: [] }));
    g.n++;
    if (row.next_day_return < 0) g.down++;
    g.returns.push(row.next_day_return);
  }
  // Every level lib/baseRates.ts resolveBaseRate() walks must exist here, or a
  // lookup silently skips a rung:
  //   cap×rv×range → cap×range → cap×rv → cap → range → global
  for (const r of rows) {
    const cb = capBand(r.market_cap);
    const rb = relvolBand(r.relative_volume);
    const gb = rangeBand(r.day_range_pct);
    if (cb && rb && gb) add(`${cb}|${rb}|${gb}`, r);
    if (cb && gb) add(`${cb}|ALL|${gb}`, r);
    if (cb && rb) add(`${cb}|${rb}|ALL`, r);
    if (cb) add(`${cb}|ALL|ALL`, r);
    if (gb) add(`ALL|ALL|${gb}`, r);
    add(`ALL|ALL|ALL`, r);
  }
  const baseRates = [...groups.entries()].map(([k, g]) => {
    const [cap_band, relvol_band, range_band] = k.split("|");
    return {
      cap_band,
      relvol_band,
      range_band,
      n: g.n,
      down_rate: g.down / g.n,
      median_next_day_return: median(g.returns),
      // Conditional medians (fractions): the payoff dimension — what a fade
      // typically gives back vs what a continued run typically costs a short.
      median_down_move: median(g.returns.filter((r) => r < 0)),
      median_up_move: median(g.returns.filter((r) => r >= 0)),
    };
  });

  // Replace the table contents.
  const { error: delErr } = await supabase
    .from("gainer_base_rates")
    .delete()
    .not("cap_band", "is", null);
  if (delErr) {
    console.error("gainer_base_rates clear error:", delErr.message);
    process.exit(1);
  }
  const { error: insErr } = await supabase.from("gainer_base_rates").insert(baseRates);
  if (insErr) {
    console.error("gainer_base_rates insert error:", insErr.message);
    process.exit(1);
  }

  console.log(`\nWrote ${baseRates.length} base-rate buckets:`);
  const g = groups.get("ALL|ALL|ALL");
  console.log(`GLOBAL n=${g.n}  down=${(100 * g.down / g.n).toFixed(1)}%`);

  // The magnitude rung, summarised on its own — it is the reason this table was
  // recomputed, and it is invisible in a cap×relvol listing.
  console.log("\nBy intraday-range band (cap/relvol collapsed):");
  for (const band of ["r_lo", "r_mid", "r_hi"]) {
    const b = baseRates.find(
      (r) => r.cap_band === "ALL" && r.relvol_band === "ALL" && r.range_band === band,
    );
    if (b) {
      console.log(`  ${band.padEnd(6)} n=${String(b.n).padStart(4)}  down=${(100 * b.down_rate).toFixed(1)}%`);
    }
  }

  console.log("\nFully-specified buckets (cap x relvol x range):");
  for (const r of baseRates.filter(
    (b) => b.cap_band !== "ALL" && b.relvol_band !== "ALL" && b.range_band !== "ALL",
  )) {
    const md = r.median_down_move != null ? (100 * r.median_down_move).toFixed(1) : "?";
    const mu = r.median_up_move != null ? (100 * r.median_up_move).toFixed(1) : "?";
    const thin = r.n < 30 ? "  <MIN_N, falls back" : "";
    console.log(
      `  ${r.cap_band.padEnd(6)} ${r.relvol_band.padEnd(11)} ${r.range_band.padEnd(6)} n=${String(r.n).padStart(4)}  down=${(100 * r.down_rate).toFixed(0)}%  medDown=${md}%  medUp=+${mu}%${thin}`,
    );
  }
}
