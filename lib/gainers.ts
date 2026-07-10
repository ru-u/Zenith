import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DailyGainer } from "./supabase/types";
import type { GainerRow } from "./marketdata/types";
import { isLikelySplitArtifact } from "./marketdata/normalize";

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

/** Most recent date that has stored gainers (for non-trading-day fallback). */
export async function getLatestGainersDate(
  client: SupabaseClient<Database>,
): Promise<string | null> {
  const { data } = await client
    .from("daily_gainers")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle<{ date: string }>();
  return data?.date ?? null;
}

function near(a: number | null, b: number | null, eps: number): boolean {
  return a != null && b != null && Math.abs(a - b) < eps;
}

/**
 * Drop "frozen repeats": a halted / non-trading stock keeps reporting the exact
 * same price, change%, and volume day after day (e.g. INHD after an SEC halt),
 * so it re-appears as the top gainer and accrues fake streaks. If a ticker's
 * price + change% + volume all match the prior trading day, it didn't actually
 * move today — exclude it and re-rank. (Three-field match makes false positives
 * effectively impossible for a stock that genuinely traded.)
 */
export function dropFrozenRepeats(
  rows: DailyGainer[],
  prev: DailyGainer[],
): DailyGainer[] {
  if (prev.length === 0) return rows;
  const prevByTicker = new Map(prev.map((p) => [p.ticker, p]));
  return rows
    .filter((r) => {
      const p = prevByTicker.get(r.ticker);
      if (!p) return true;
      const frozen =
        near(r.price, p.price, 0.01) &&
        near(r.change_percent, p.change_percent, 0.1) &&
        r.volume != null &&
        p.volume != null &&
        Math.round(r.volume) === Math.round(p.volume);
      return !frozen;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Drop reverse-split artifacts from stored rows and re-rank. New fetches are
 * already filtered in rankAndFilter; this heals rows persisted before the
 * guard existed (e.g. ENLV 2026-07-09: a 15:1 reverse split stored as +1414%).
 */
export function dropSplitArtifacts(rows: DailyGainer[]): DailyGainer[] {
  const kept = rows.filter(
    (r) => !isLikelySplitArtifact(r.change_percent, r.relative_volume),
  );
  if (kept.length === rows.length) return rows;
  return kept.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Most recent stored date strictly before `date`, or null. */
export async function getGainersDateBefore(
  client: SupabaseClient<Database>,
  date: string,
): Promise<string | null> {
  const { data } = await client
    .from("daily_gainers")
    .select("date")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle<{ date: string }>();
  return data?.date ?? null;
}

/**
 * Cleaned, re-ranked gainers for a date — split artifacts dropped, then the
 * frozen-repeat filter applied vs the prior trading day. Raw rows stay in the
 * DB (so the day-over-day chain keeps working); cleaning happens on read.
 */
export async function getCleanedGainers(
  client: SupabaseClient<Database>,
  date: string,
): Promise<DailyGainer[]> {
  const rows = await getCachedGainers(client, date);
  if (rows.length === 0) return rows;
  const prevDate = await getGainersDateBefore(client, date);
  const prev = prevDate ? await getCachedGainers(client, prevDate) : [];
  return dropFrozenRepeats(dropSplitArtifacts(rows), prev);
}

/** Most recent scraped_at among a date's rows (drives the freshness check). */
export function latestScrapedAt(rows: DailyGainer[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (!latest || r.scraped_at > latest) latest = r.scraped_at;
  }
  return latest;
}
