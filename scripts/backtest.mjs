// Threshold-strategy backtest over recorded thesis outcomes.
//
// Strategy per threshold T: each day, short EVERY thesis scored >= T at that
// day's close (equal capital split across that day's qualifying calls), cover
// at the next session's close. This is exactly the DECA Stock Market Game's
// fill mechanics — EOD fills, no borrow costs — so the simulation mirrors what
// a student following the calls would have scored, 1:1.
//
// Honesty guard: ALWAYS prints every threshold (all / >=6 / >=7 / >=8). Any
// published number must name its rule, period, and n — the report exists so
// the choice of threshold is a disclosed decision, not silent cherry-picking.
//
//   node --env-file=.env.local scripts/backtest.mjs [--since 2026-08-01] [--until 2026-08-31]

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const since = flag("--since");
const until = flag("--until");

let q = supabase
  .from("ai_analyses")
  .select("date, ticker, short_score, percent_win_estimate, next_change_percent")
  .not("short_score", "is", null)
  .not("next_change_percent", "is", null)
  .order("date", { ascending: true });
if (since) q = q.gte("date", since);
if (until) q = q.lte("date", until);

const { data, error } = await q;
if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}
const rows = data ?? [];
if (rows.length === 0) {
  console.log("No scored theses with recorded outcomes in the window.");
  process.exit(0);
}

const first = rows[0].date;
const last = rows[rows.length - 1].date;
console.log(`Backtest window: ${first} → ${last} (${rows.length} thesis-outcomes)`);
console.log("Fills: short at scored day's close, cover at next session's close (DECA EOD rules).\n");

const THRESHOLDS = [
  { label: "all calls", min: 1 },
  { label: "score ≥ 6", min: 6 },
  { label: "score ≥ 7", min: 7 },
  { label: "score ≥ 8", min: 8 },
];

for (const t of THRESHOLDS) {
  const trades = rows.filter((r) => r.short_score >= t.min);
  if (trades.length === 0) {
    console.log(`${t.label.padEnd(10)} — no qualifying trades`);
    continue;
  }

  // Short P&L per trade, %: the stock falling next day is the short's gain.
  const returns = trades.map((r) => -r.next_change_percent);
  const wins = returns.filter((r) => r > 0).length;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const best = Math.max(...returns);
  const worst = Math.min(...returns);

  // Daily portfolio: equal capital across that day's qualifying calls, chained
  // across days for the cumulative curve + max drawdown.
  const byDay = new Map();
  for (const r of trades) {
    const list = byDay.get(r.date) ?? [];
    list.push(-r.next_change_percent);
    byDay.set(r.date, list);
  }
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const day of [...byDay.keys()].sort()) {
    const rets = byDay.get(day);
    const dayRet = rets.reduce((a, b) => a + b, 0) / rets.length / 100;
    equity *= 1 + dayRet;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity / peak - 1);
  }
  const cum = (equity - 1) * 100;

  const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  console.log(
    `${t.label.padEnd(10)} n=${String(trades.length).padStart(3)}  win-rate=${((100 * wins) / returns.length).toFixed(0)}%  avg/trade=${pct(avg)}  cumulative=${pct(cum)} (${byDay.size} days)  maxDD=${(100 * maxDD).toFixed(1)}%  best=${pct(best)}  worst=${pct(worst)}`,
  );
}

console.log(
  "\nNote: simulated, not traded. Publish only with the rule, period, and n stated.",
);
