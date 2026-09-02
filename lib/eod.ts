import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DailyGainer } from "./supabase/types";
import type { GainerRow } from "./marketdata";
import { getCleanedGainers } from "./gainers";
import { updateStreaks } from "./streaks";
import { generateAndStoreTopAnalyses } from "./claude";
import { sendPreCloseEmails } from "./notify";
import { type BaseRate } from "./baseRates";
import { recordThesisOutcomes } from "./quant/outcomes";

/** Prior-day consecutive-gainer streak per ticker — neutral context for the AI. */
async function fetchStreaks(
  admin: SupabaseClient<Database>,
  tickers: string[],
): Promise<Map<string, number>> {
  if (tickers.length === 0) return new Map();
  const { data } = await admin
    .from("ticker_streaks")
    .select("ticker, streak_count")
    .in("ticker", tickers);
  return new Map((data ?? []).map((r) => [r.ticker, r.streak_count]));
}

/**
 * Per-ticker empirical base-rate prior, resolved from the precomputed
 * cap×relvol buckets. The quant scorer needs the numeric BaseRate object (the
 * thesis template formats it to prose itself). Empty/absent table → null
 * priors (scoring falls back to a coin-flip anchor), so this is safe to ship
 * before the historical data is ingested.
 */
async function fetchBaseRates(admin: SupabaseClient<Database>): Promise<BaseRate[]> {
  // `select("*")` deliberately, not a column list: naming `range_band` would make
  // this query fail outright against a database where migrate.sql hasn't run yet,
  // and a failed read here is invisible — every prior resolves null and the whole
  // board silently scores off the coin-flip anchor. With `*`, a pre-migration
  // database simply returns rows without the column, `resolveBaseRate` reads them
  // as the 'ALL' fallback level, and scoring is exactly what it was before.
  const { data, error } = await admin.from("gainer_base_rates").select("*");
  if (error) {
    console.error("[eod] base-rate read failed — scoring on the coin-flip anchor:", error.message);
    return [];
  }
  const rates = (data ?? []) as BaseRate[];
  if (rates.length > 0 && rates.every((r) => r.range_band == null)) {
    console.warn(
      "[eod] gainer_base_rates has no range_band — run supabase/migrate.sql and " +
        "scripts/historical-base-rates.mjs --from-db to enable the magnitude dimension",
    );
  }
  return rates;
}

/** Cleaned (frozen-repeats removed) gainers → re-ranked GainerRow set. */
function toGainerRows(cleaned: DailyGainer[]): GainerRow[] {
  return cleaned.map((g, i) => ({
    ticker: g.ticker,
    exchange: g.exchange,
    companyName: g.company_name,
    price: g.price,
    changePercent: g.change_percent,
    volume: g.volume,
    relativeVolume: g.relative_volume,
    marketCap: g.market_cap,
    sector: g.sector,
    rank: i + 1,
  }));
}

/**
 * Pre-close "drop" (~30 min before the close): generate AI theses for the current
 * top-N off the intraday data, then email opted-in users. This is the actionable
 * moment — DECA orders placed before the close fill at today's close. Idempotent:
 * `generateAndStoreTopAnalyses` skips tickers it already stored, and the email is
 * deduped once per day, so the read-path firing on many requests is safe.
 * Returns the number of AI theses newly created.
 */
export async function runPreCloseProcessing(
  admin: SupabaseClient<Database>,
  dateKey: string,
  aiCount = 5,
): Promise<number> {
  const cleaned = await getCleanedGainers(admin, dateKey);
  if (cleaned.length === 0) return 0;

  const rows = toGainerRows(cleaned);
  const top = rows.slice(0, aiCount);
  const streaks = await fetchStreaks(admin, top.map((r) => r.ticker));
  const baseRates = await fetchBaseRates(admin);
  const created = await generateAndStoreTopAnalyses(
    admin,
    rows,
    dateKey,
    streaks,
    baseRates,
    aiCount,
  );

  // The quant engine generates unconditionally (it's free), so the drop email
  // always has theses to announce. Best-effort: a send failure must never fail
  // the drop (theses still landed).
  try {
    await sendPreCloseEmails(admin, dateKey, rows);
  } catch (e) {
    console.error("[eod] pre-close email:", (e as Error)?.message);
  }
  return created;
}

/**
 * End-of-day post-processing for a finalized trading day: streaks + AI theses,
 * computed off the cleaned (frozen-repeats removed) gainer set. Shared by the
 * EOD cron and the on-read close-capture in /api/gainers.
 *
 * Safe to run more than once: `updateStreaks` won't double-count and
 * `generateAndStoreTopAnalyses` skips theses that already exist — so when the
 * ~3:30 drop already produced theses this is a thesis no-op, and it only
 * generates them as a fallback when the drop failed. Returns theses newly created.
 */
export async function runEodProcessing(
  admin: SupabaseClient<Database>,
  dateKey: string,
  aiCount = 5,
): Promise<number> {
  const cleaned = await getCleanedGainers(admin, dateKey);
  if (cleaned.length === 0) return 0;

  const rows = toGainerRows(cleaned);
  const top = rows.slice(0, aiCount);
  // Read streaks BEFORE updateStreaks so the count is on the same prior-day basis
  // as the pre-close drop (not yet including today).
  const streaks = await fetchStreaks(admin, top.map((r) => r.ticker));
  const baseRates = await fetchBaseRates(admin);

  await updateStreaks(
    admin,
    cleaned.map((g) => g.ticker),
    dateKey,
  );

  // Stamp yesterday's theses with today's close — the calibration data the
  // scoring Δs get re-fit against. Best-effort: a scanner hiccup here must
  // never fail the EOD pass; the null-check lets any later same-day trigger
  // (cron backstop, read-path finalize) fill what this run missed.
  try {
    await recordThesisOutcomes(admin, dateKey);
  } catch (e) {
    console.error("[eod] outcome recording:", (e as Error)?.message);
  }

  return generateAndStoreTopAnalyses(admin, rows, dateKey, streaks, baseRates, aiCount);
}
