import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { isTradingDay } from "./market-calendar";

const DAY_MS = 86_400_000;

function dateKeyToUTC(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// isTradingDay reads the date in ET; UTC midnight renders as the PRIOR ET day,
// so probe at UTC noon (= same calendar date in ET).
function isTradingDayAt(utcMidnight: number): boolean {
  return isTradingDay(new Date(utcMidnight + DAY_MS / 2));
}

/**
 * Is `todayKey` the next trading day after `prevKey`? True when no trading day
 * (per the market calendar: weekends + US holidays) falls strictly between
 * them — so streaks survive weekends and holiday gaps like Thu→Mon over
 * July 4th.
 */
export function isConsecutiveTradingDay(prevKey: string, todayKey: string): boolean {
  const prev = dateKeyToUTC(prevKey);
  const today = dateKeyToUTC(todayKey);
  if (today <= prev) return false;
  // Bounded: no US market gap exceeds a few days; cap the walk defensively.
  if (today - prev > 10 * DAY_MS) return false;
  for (let t = prev + DAY_MS; t < today; t += DAY_MS) {
    if (isTradingDayAt(t)) return false; // a trading day was skipped
  }
  return true;
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
