import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

function dateKeyToUTC(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Is `todayKey` the next trading day after `prevKey`?
 * - calendar diff of 1 day → consecutive (Tue after Mon, etc.)
 * - diff of 3 with today === Monday → Fri→Mon over the weekend
 * (US market holidays are not modeled in the MVP.)
 */
export function isConsecutiveTradingDay(prevKey: string, todayKey: string): boolean {
  const prev = dateKeyToUTC(prevKey);
  const today = dateKeyToUTC(todayKey);
  const diffDays = Math.round((today - prev) / 86_400_000);
  if (diffDays === 1) return true;
  const todayWeekday = new Date(today).getUTCDay(); // 1 = Monday
  return diffDays === 3 && todayWeekday === 1;
}

/**
 * Upsert streaks for the tickers that appeared on `dateKey`.
 * Increment when the previous appearance was the prior trading day, else reset
 * to 1. Idempotent: re-running for the same date won't double-count. O(1) per
 * ticker — no full-table scan (the VixSight problem this rebuild fixes).
 */
export async function updateStreaks(
  admin: SupabaseClient<Database>,
  tickers: string[],
  dateKey: string,
): Promise<void> {
  if (tickers.length === 0) return;

  const { data: existing, error } = await admin
    .from("ticker_streaks")
    .select("*")
    .in("ticker", tickers);
  if (error) throw error;

  const prevByTicker = new Map((existing ?? []).map((s) => [s.ticker, s]));

  const rows = tickers.map((ticker) => {
    const prev = prevByTicker.get(ticker);
    let streak_count = 1;
    if (prev?.last_seen_date) {
      if (prev.last_seen_date === dateKey) {
        streak_count = prev.streak_count; // already counted today
      } else if (isConsecutiveTradingDay(prev.last_seen_date, dateKey)) {
        streak_count = prev.streak_count + 1;
      }
    }
    // updated_at intentionally omitted — it has a DB default and isn't present
    // in every deployed schema version.
    return { ticker, streak_count, last_seen_date: dateKey };
  });

  const { error: upsertError } = await admin
    .from("ticker_streaks")
    .upsert(rows, { onConflict: "ticker" });
  if (upsertError) throw upsertError;
}
