// Realized-outcome recorder — the feedback half of the scoring loop. The Δ
// constants in score.ts are meant to be re-fit against realized next-day
// returns, but daily_gainers only captures each day's *gainers*, so a scored
// ticker's next close is never stored unless it happens to spike again (a
// biased sample: recording only re-gainers would keep the engine's misses and
// drop its wins). This module closes that gap: at EOD on day D it looks up the
// previous trading day's scored theses and stamps them with day D's close.
//
// Deliberately no historical backfill: the scanner only serves current quotes,
// and back-filling from daily_gainers re-introduces the re-gainer bias above.
// Rows whose next session predates the recorder stay null and are simply
// excluded from calibration.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { SCAN_URL, USER_AGENT } from "../marketdata/tradingview";
import { withRetry } from "../retry";
import { tradingDaysAgoKey } from "../market-calendar";

const REQUEST_TIMEOUT_MS = 8_000;

/** Current close for a small ticker list — same scanner + posture as technicals.ts. */
async function fetchCloses(tickers: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (tickers.length === 0) return out;

  const post = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(SCAN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": USER_AGENT,
          origin: "https://www.tradingview.com",
          referer: "https://www.tradingview.com/",
        },
        body: JSON.stringify({
          symbols: {
            tickers: tickers.flatMap((t) => [`NASDAQ:${t}`, `NYSE:${t}`]),
            query: { types: [] },
          },
          columns: ["name", "close"],
          options: { lang: "en" },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`scanner returned ${res.status}`);
      return (await res.json()) as { data?: Array<{ s: string; d: unknown[] }> };
    } finally {
      clearTimeout(timeout);
    }
  };

  const json = await withRetry(post, {
    onRetry: (err, attempt, delay) =>
      console.warn(
        `[outcomes] retry ${attempt} in ${Math.round(delay)}ms:`,
        (err as Error)?.message,
      ),
  });
  for (const entry of json.data ?? []) {
    const ticker = (entry.d[0] as string) ?? entry.s.split(":").pop();
    const close = entry.d[1];
    if (ticker && !out.has(ticker) && typeof close === "number" && Number.isFinite(close)) {
      out.set(ticker, close);
    }
  }
  return out;
}

/**
 * Stamp the previous trading day's scored theses with today's close. Runs from
 * `runEodProcessing` (day D at/after the close), so "today's close" is the
 * correct next-session close for day D-1 rows — never call it intraday.
 * Idempotent: only rows with `next_close is null` are touched, so cron + the
 * on-read close-capture firing together record once. Returns rows recorded.
 */
export async function recordThesisOutcomes(
  admin: SupabaseClient<Database>,
  dateKey: string,
): Promise<number> {
  // Previous trading day relative to dateKey (probe at UTC noon for DST safety;
  // count=2 because tradingDaysAgoKey counts dateKey itself as the first day).
  const [y, m, d] = dateKey.split("-").map(Number);
  const prevKey = tradingDaysAgoKey(2, new Date(Date.UTC(y, m - 1, d, 12)));
  if (prevKey === dateKey) return 0;

  const { data: pending } = await admin
    .from("ai_analyses")
    .select("id, ticker")
    .eq("date", prevKey)
    .not("short_score", "is", null)
    .is("next_close", null);
  if (!pending || pending.length === 0) return 0;

  // The scored day's official close — the baseline the outcome is measured from.
  const tickers = pending.map((r) => r.ticker);
  const { data: prevRows } = await admin
    .from("daily_gainers")
    .select("ticker, price")
    .eq("date", prevKey)
    .eq("is_final", true)
    .in("ticker", tickers);
  const prevClose = new Map(
    (prevRows ?? [])
      .filter((r) => r.price != null && r.price > 0)
      .map((r) => [r.ticker, r.price as number]),
  );

  const nextClose = await fetchCloses(tickers.filter((t) => prevClose.has(t)));

  let recorded = 0;
  for (const row of pending) {
    const prev = prevClose.get(row.ticker);
    const next = nextClose.get(row.ticker);
    if (prev == null || next == null) continue; // unresolvable today; stays null
    const { error } = await admin
      .from("ai_analyses")
      .update({
        next_date: dateKey,
        next_close: next,
        next_change_percent: ((next - prev) / prev) * 100,
        outcome_win: next < prev,
      })
      .eq("id", row.id)
      .is("next_close", null);
    if (error) {
      console.error(`[outcomes] update ${row.ticker} failed:`, error.message);
    } else {
      recorded++;
    }
  }
  if (recorded > 0) {
    console.log(`[outcomes] recorded ${recorded}/${pending.length} outcomes for ${prevKey}`);
  }
  return recorded;
}
