// Read-only inventory that gates the public /stock/[ticker] pages.
//
// Ticker pages are only worth shipping if enough tickers have enough history to
// say something real about them. A pile of near-empty pages is a ranking
// liability, not an asset — so this counts what we actually have before any of
// them get built.
//
//   node --env-file=.env.local scripts/seo-inventory.mjs
//
// Writes nothing. Safe to run against production.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Page through every board row; PostgREST caps a single select at 1000.
async function allRows(table, columns) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

const board = await allRows("daily_gainers", "ticker,company_name,exchange,sector,date,market_cap,relative_volume");
const hist = await allRows("historical_gainers", "ticker,spike_date,next_day_down");
const { data: streaks } = await db.from("ticker_streaks").select("ticker,streak_count");

const dates = [...new Set(board.map((r) => r.date))].sort();
console.log(`daily_gainers   ${board.length} rows | ${dates.length} sessions | ${dates[0]} → ${dates.at(-1)}`);
console.log(`historical_gainers ${hist.length} rows | ${new Set(hist.map((r) => r.ticker)).size} distinct tickers`);
console.log(`ticker_streaks  ${(streaks ?? []).length} rows`);

const byTicker = new Map();
for (const r of board) {
  const e = byTicker.get(r.ticker) ?? { n: 0, name: null, exchange: null, dates: [] };
  e.n++;
  e.name ??= r.company_name;
  e.exchange ??= r.exchange;
  e.dates.push(r.date);
  byTicker.set(r.ticker, e);
}
const histByTicker = new Map();
for (const r of hist) histByTicker.set(r.ticker, (histByTicker.get(r.ticker) ?? 0) + 1);

console.log(`\ndistinct tickers on the board: ${byTicker.size}`);
const buckets = new Map();
for (const [, e] of byTicker) buckets.set(e.n, (buckets.get(e.n) ?? 0) + 1);
console.log("appearances → how many tickers:");
for (const n of [...buckets.keys()].sort((a, b) => a - b)) {
  console.log(`  ${String(n).padStart(3)}  ${buckets.get(n)}`);
}

// The quality bar from the plan: >=2 board appearances, OR 1 appearance plus
// historical spike coverage to say something about what usually follows.
let qualify = 0, byCount = 0, byHist = 0, noName = 0;
for (const [t, e] of byTicker) {
  const h = histByTicker.get(t) ?? 0;
  const ok = e.n >= 2 || h >= 1;
  if (ok) {
    qualify++;
    if (e.n >= 2) byCount++; else byHist++;
    if (!e.name) noName++;
  }
}
console.log(`\nqualifying tickers: ${qualify}  (>=2 appearances: ${byCount}, 1 appearance + history: ${byHist})`);
console.log(`  of those, missing company_name: ${noName}`);
console.log(qualify >= 40
  ? `\n=> GO: ${qualify} pages clears the ~40-50 bar.`
  : `\n=> HOLD: ${qualify} is below the ~40-50 bar; revisit after more sessions.`);
