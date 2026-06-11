import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DailyGainer } from "./supabase/types";
import type { GainerRow } from "./marketdata/types";

/** Map a normalized provider row to a daily_gainers insert. */
function toDbRow(row: GainerRow, dateKey: string, isFinal: boolean, scrapedAt: string) {
  return {
    date: dateKey,
    ticker: row.ticker,
    company_name: row.companyName,
    price: row.price,
    change_percent: row.changePercent,
    // volume / market_cap may be integer-typed columns; providers can return
    // fractional values. Round to be safe (fractional cents are irrelevant here).
    volume: row.volume == null ? null : Math.round(row.volume),
    relative_volume: row.relativeVolume,
    market_cap: row.marketCap == null ? null : Math.round(row.marketCap),
    sector: row.sector,
    rank: row.rank,
    is_final: isFinal,
    scraped_at: scrapedAt,
  };
}

/** Upsert a ranked set of gainers for a date. Uses the service-role client. */
export async function persistGainers(
  admin: SupabaseClient<Database>,
  rows: GainerRow[],
  dateKey: string,
  isFinal: boolean,
): Promise<void> {
  if (rows.length === 0) return;
  const scrapedAt = new Date().toISOString();
  const dbRows = rows.map((r) => toDbRow(r, dateKey, isFinal, scrapedAt));
  const { error } = await admin
    .from("daily_gainers")
    .upsert(dbRows, { onConflict: "date,ticker" });
  if (error) throw error;

  // Self-prune: remove rows for this date whose ticker fell out of the current
  // ranked set (the top-N shifts intraday, and upsert leaves orphans). Guarded
  // so a thin/failed fetch can't wipe the table.
  if (rows.length >= 10) {
    const keep = rows.map((r) => r.ticker);
    const { error: pruneError } = await admin
      .from("daily_gainers")
      .delete()
      .eq("date", dateKey)
      .not("ticker", "in", `(${keep.join(",")})`);
    if (pruneError) {
      console.error("[gainers] prune failed:", pruneError.message);
    }
  }
}

/** Read cached gainers for a date, ranked. */
export async function getCachedGainers(
  client: SupabaseClient<Database>,
  dateKey: string,
): Promise<DailyGainer[]> {
  const { data, error } = await client
    .from("daily_gainers")
    .select("*")
    .eq("date", dateKey)
    .order("rank", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Most recent scraped_at among a date's rows (drives the freshness check). */
export function latestScrapedAt(rows: DailyGainer[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (!latest || r.scraped_at > latest) latest = r.scraped_at;
  }
  return latest;
}
