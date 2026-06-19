import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import type { GainerRow } from "./marketdata";
import { getCleanedGainers } from "./gainers";
import { updateStreaks } from "./streaks";
import { generateAndStoreTopAnalyses } from "./claude";

/**
 * End-of-day post-processing for a finalized trading day: streaks + AI theses,
 * computed off the cleaned (frozen-repeats removed) gainer set. Shared by the
 * 5:05 PM EOD cron and the on-read close-capture in /api/gainers, so the AI
 * overview appears minutes after the close rather than only at cron time.
 *
 * Safe to run more than once for the same date — `updateStreaks` won't
 * double-count and `generateAndStoreTopAnalyses` skips theses that already
 * exist. Returns the number of AI theses newly created.
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

  const cleanedRows: GainerRow[] = cleaned.map((g, i) => ({
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

  return generateAndStoreTopAnalyses(admin, cleanedRows, dateKey, aiCount);
}
