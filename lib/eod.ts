import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DailyGainer } from "./supabase/types";
import type { GainerRow } from "./marketdata";
import { getCleanedGainers } from "./gainers";
import { updateStreaks } from "./streaks";
import { generateAndStoreTopAnalyses } from "./claude";
import { sendPreCloseEmails } from "./notify";
import {
  resolveBaseRate,
  formatBaseRatePrior,
  type BaseRate,
} from "./baseRates";

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
 * Per-ticker empirical base-rate prior (Phase 2), resolved from the precomputed
 * cap×relvol buckets. Empty/absent table → null priors (prompt omits the line),
 * so this is safe to ship before the historical data is ingested.
 */
async function fetchBaseRatePriors(
  admin: SupabaseClient<Database>,
  rows: GainerRow[],
): Promise<Map<string, string | null>> {
  const { data } = await admin
    .from("gainer_base_rates")
    .select("cap_band, relvol_band, n, down_rate, median_next_day_return");
  const rates = (data ?? []) as BaseRate[];
  const priors = new Map<string, string | null>();
  for (const g of rows) {
    priors.set(
      g.ticker,
      formatBaseRatePrior(resolveBaseRate(rates, g.marketCap, g.relativeVolume)),
    );
  }
  return priors;
}

/** Cleaned (frozen-repeats removed) gainers → re-ranked GainerRow set. */
function toGainerRows(cleaned: DailyGainer[]): GainerRow[] {
  return cleaned.map((g, i) => ({
    ticker: g.ticker,
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
  const priors = await fetchBaseRatePriors(admin, top);
  const created = await generateAndStoreTopAnalyses(
    admin,
    rows,
    dateKey,
    streaks,
    priors,
    aiCount,
  );

  // Best-effort: a send failure must never fail the drop (theses still landed).
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
  const priors = await fetchBaseRatePriors(admin, top);

  await updateStreaks(
    admin,
    cleaned.map((g) => g.ticker),
    dateKey,
  );

  return generateAndStoreTopAnalyses(admin, rows, dateKey, streaks, priors, aiCount);
}
