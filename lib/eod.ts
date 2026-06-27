import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DailyGainer } from "./supabase/types";
import type { GainerRow } from "./marketdata";
import { getCleanedGainers } from "./gainers";
import { updateStreaks } from "./streaks";
import { generateAndStoreTopAnalyses } from "./claude";
import { sendPreCloseEmails } from "./notify";

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
  const created = await generateAndStoreTopAnalyses(admin, rows, dateKey, aiCount);

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

  await updateStreaks(
    admin,
    cleaned.map((g) => g.ticker),
    dateKey,
  );

  return generateAndStoreTopAnalyses(admin, toGainerRows(cleaned), dateKey, aiCount);
}
