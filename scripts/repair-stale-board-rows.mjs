// One-off repair for the thesis-pin damage (see lib/gainers.ts, PR "decouple the
// drop's thesis set from the finalized board").
//
// The prune used to PIN any ticker that had an AI thesis, so its daily_gainers
// row survived the finalize — but nothing ever REFRESHED that row. A ticker that
// spiked into the ~3:30 drop and reversed into the close kept its last intraday
// snapshot forever: AIFU sat in 2026-09-04 at rank 98, +5.603%, is_final = false,
// on a day it actually closed -18.58%. Those rows are fabricated gainers in the
// product's core table, and recordThesisOutcomes skips them (it requires
// is_final), so any thesis on one silently never got an outcome.
//
// This script, in order:
//   1. backfills ai_analyses.scored_day_close from finalized daily_gainers rows
//   2. lists the stale non-final orphans on days that DID finalize
//   3. deletes them (only with --apply)
//
// Step 1 runs before step 2 on purpose: the orphans are the rows we cannot
// derive a close from (their stored figure is the wrong one), so anything
// recoverable must be recovered from the HEALTHY rows first.
//
// A ticker that reversed cannot be repaired automatically — the TradingView
// scanner serves current quotes only, so a past session's true close is not
// re-fetchable. Two ways to supply one by hand:
//
//   --set=TICKER=DATE:CLOSE:CHANGE       both figures, straight from the chart
//   --set-change=TICKER=DATE:CHANGE      change% only; the close is DERIVED
//
// The derivation is exact and needs nothing but the stale row: its price and
// change_percent come from the same scrape, so the prior session's close is
// price / (1 + change/100), and the true close is that times (1 + true/100).
// It must run before step 3 deletes the row it reads — it does.
//
//   --set-change=AIFU=2026-09-04:-18.58
//
//   node --env-file=.env.local scripts/repair-stale-board-rows.mjs            # dry run
//   node --env-file=.env.local scripts/repair-stale-board-rows.mjs --apply
//
// DRY RUN BY DEFAULT. Nothing is written or deleted without --apply.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)",
  );
  process.exit(1);
}
const db = createClient(url, key);

const apply = process.argv.includes("--apply");
const manual = process.argv
  .filter((a) => a.startsWith("--set="))
  .map((a) => a.slice("--set=".length))
  .filter(Boolean);
const derived = process.argv
  .filter((a) => a.startsWith("--set-change="))
  .map((a) => a.slice("--set-change=".length))
  .filter(Boolean);

const label = apply ? "APPLY" : "DRY RUN";
console.log(`\n=== repair-stale-board-rows (${label}) ===\n`);

// ── 0. Manual closes ─────────────────────────────────────────────────────────
// For tickers whose real close cannot be re-fetched or derived. Format:
//   TICKER=YYYY-MM-DD:close:changePercent
for (const spec of manual) {
  const m = /^([A-Z.]+)=(\d{4}-\d{2}-\d{2}):(-?[\d.]+):(-?[\d.]+)$/.exec(spec);
  if (!m) {
    console.error(`  ! unparseable --set "${spec}" (want TICKER=YYYY-MM-DD:close:change)`);
    process.exitCode = 1;
    continue;
  }
  const [, ticker, date, close, change] = m;
  console.log(`  manual  ${date} ${ticker}  close ${close}  change ${change}%`);
  if (apply) {
    const { data: hit, error } = await db
      .from("ai_analyses")
      .update({
        scored_day_close: Number(close),
        scored_day_change_percent: Number(change),
      })
      .eq("date", date)
      .eq("ticker", ticker)
      .select("id");
    if (error) console.error(`  ! ${ticker}: ${error.message}`);
    // A typo in the ticker or the date matches nothing, updates nothing, and
    // returns no error — the one failure here you would never notice.
    else if (!hit?.length) {
      console.error(`  ! ${date} ${ticker}: no ai_analyses row matched — nothing written.`);
      process.exitCode = 1;
    }
  }
}

// Same, but with the close derived from the stale board row's own figures.
for (const spec of derived) {
  const m = /^([A-Z.]+)=(\d{4}-\d{2}-\d{2}):(-?[\d.]+)$/.exec(spec);
  if (!m) {
    console.error(`  ! unparseable --set-change "${spec}" (want TICKER=YYYY-MM-DD:change)`);
    process.exitCode = 1;
    continue;
  }
  const [, ticker, date, changeStr] = m;
  const trueChange = Number(changeStr);
  const { data: stale } = await db
    .from("daily_gainers")
    .select("price, change_percent")
    .eq("date", date)
    .eq("ticker", ticker)
    .maybeSingle();
  if (!stale || stale.price == null || stale.change_percent == null) {
    console.error(
      `  ! ${date} ${ticker}: no board row with both price and change_percent — ` +
        `use --set=TICKER=DATE:CLOSE:CHANGE instead.`,
    );
    process.exitCode = 1;
    continue;
  }
  const prevClose = stale.price / (1 + stale.change_percent / 100);
  const trueClose = prevClose * (1 + trueChange / 100);
  console.log(
    `  derive  ${date} ${ticker}  stale ${stale.price} @ +${stale.change_percent}% ` +
      `→ prev close ${prevClose.toFixed(4)} → close ${trueClose.toFixed(4)} @ ${trueChange}%`,
  );
  if (apply) {
    const { data: hit, error } = await db
      .from("ai_analyses")
      .update({ scored_day_close: trueClose, scored_day_change_percent: trueChange })
      .eq("date", date)
      .eq("ticker", ticker)
      .select("id");
    if (error) console.error(`  ! ${ticker}: ${error.message}`);
    else if (!hit?.length) {
      console.error(`  ! ${date} ${ticker}: no ai_analyses row matched — nothing written.`);
      process.exitCode = 1;
    }
  }
}
if (manual.length || derived.length) console.log("");

// ── 1. Backfill scored_day_close from finalized board rows ───────────────────
const { data: pending, error: pendErr } = await db
  .from("ai_analyses")
  .select("id, date, ticker")
  .is("scored_day_close", null)
  .order("date", { ascending: true });
if (pendErr) {
  console.error("ai_analyses read failed:", pendErr.message);
  process.exit(1);
}

console.log(`1. backfill — ${pending.length} thesis row(s) with no scored_day_close`);
let filled = 0;
let unrecoverable = [];
for (const row of pending) {
  const { data: board } = await db
    .from("daily_gainers")
    .select("price, change_percent")
    .eq("date", row.date)
    .eq("ticker", row.ticker)
    .eq("is_final", true)
    .maybeSingle();
  if (!board || board.price == null) {
    unrecoverable.push(`${row.date} ${row.ticker}`);
    continue;
  }
  filled++;
  if (apply) {
    const { error } = await db
      .from("ai_analyses")
      .update({
        scored_day_close: board.price,
        scored_day_change_percent: board.change_percent,
      })
      .eq("id", row.id)
      .is("scored_day_close", null);
    if (error) console.error(`  ! ${row.date} ${row.ticker}: ${error.message}`);
  }
}
console.log(`   recoverable from the finalized board: ${filled}`);
if (unrecoverable.length) {
  console.log(
    `   NOT recoverable (no is_final row — these are the reversals): ${unrecoverable.length}`,
  );
  for (const u of unrecoverable) console.log(`     ${u}`);
  console.log(`   → fix by hand with --set=TICKER=DATE:CLOSE:CHANGE from the chart.`);
}

// ── 2. Stale non-final orphans on days that DID finalize ─────────────────────
const { data: nonFinal, error: nfErr } = await db
  .from("daily_gainers")
  .select("id, date, ticker, exchange, rank, price, change_percent, scraped_at")
  .eq("is_final", false)
  .order("date", { ascending: true });
if (nfErr) {
  console.error("daily_gainers read failed:", nfErr.message);
  process.exit(1);
}

const finalizedDates = new Set();
for (const date of new Set(nonFinal.map((r) => r.date))) {
  const { count } = await db
    .from("daily_gainers")
    .select("id", { count: "exact", head: true })
    .eq("date", date)
    .eq("is_final", true);
  if ((count ?? 0) > 0) finalizedDates.add(date);
}
const orphans = nonFinal.filter((r) => finalizedDates.has(r.date));

console.log(`\n2. orphans — ${orphans.length} non-final row(s) on days that finalized`);
for (const r of orphans) {
  console.log(
    `   ${r.date}  #${r.rank ?? "?"} ${r.exchange ?? "?"}:${r.ticker}  ` +
      `${r.change_percent ?? "?"}% @ ${r.price ?? "?"}  (scraped ${r.scraped_at})`,
  );
}

// ── 3. Delete them ───────────────────────────────────────────────────────────
console.log(`\n3. delete`);
if (orphans.length === 0) {
  console.log("   nothing to delete.");
} else if (!apply) {
  console.log(`   would delete ${orphans.length} row(s). Re-run with --apply.`);
} else {
  const { error } = await db
    .from("daily_gainers")
    .delete()
    .in("id", orphans.map((r) => r.id));
  if (error) console.error(`   ! delete failed: ${error.message}`);
  else console.log(`   deleted ${orphans.length} row(s).`);
}

console.log(
  `\n${apply ? "Applied." : "Dry run — nothing was written. Re-run with --apply."}\n`,
);
