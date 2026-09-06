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
import { isAllowedExchange } from "../marketdata/symbols";
import type { SymbolRef } from "./technicals";
import { withRetry } from "../retry";
import { tradingDaysAgoKey } from "../market-calendar";

const REQUEST_TIMEOUT_MS = 8_000;

/** A scanner quote. `changePercent` is the session change, signed. */
export interface Quote {
  close: number;
  changePercent: number | null;
}

/**
 * Current close + session change for a small symbol list — same scanner and
 * posture as technicals.ts. Called after the close has settled, so what the
 * scanner serves IS that session's close.
 */
export async function fetchQuotes(refs: SymbolRef[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (refs.length === 0) return out;

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
            // Exact venue when the thesis row carries it; both-prefix guess
            // only for rows stored before the exchange column existed.
            tickers: refs.flatMap((r) =>
              r.exchange && isAllowedExchange(r.exchange)
                ? [`${r.exchange}:${r.ticker}`]
                : [`NASDAQ:${r.ticker}`, `NYSE:${r.ticker}`],
            ),
            query: { types: [] },
          },
          // "change" is the same column the gainer scanner ranks on
          // (lib/marketdata/tradingview.ts) — proven name, same feed.
          columns: ["name", "close", "change"],
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
    const change = entry.d[2];
    if (ticker && !out.has(ticker) && typeof close === "number" && Number.isFinite(close)) {
      out.set(ticker, {
        close,
        // Change is optional: a missing/garbage value must not discard a good
        // close, which is the figure both callers actually depend on.
        changePercent:
          typeof change === "number" && Number.isFinite(change) ? change : null,
      });
    }
  }
  return out;
}

/**
 * Stamp today's scored theses with today's OFFICIAL close. Runs from
 * `runEodProcessing` once the close has settled, so the quote the scanner
 * serves is that session's close.
 *
 * This is the baseline `recordThesisOutcomes` measures the next session
 * against. It lives on the thesis row rather than being read back off
 * daily_gainers because that table only holds the day's *gainers*: a ticker
 * that was top-5 at the 3:30 drop and reversed into the close is not on the
 * finalized board at all (AIFU, 2026-09-04: top-5 at the drop, closed -18.58%).
 * Its baseline was therefore unresolvable, its outcome never recorded, and it
 * dropped out of calibration silently — losing precisely the reversals the
 * sample most needs. Same bias the header of this file warns about, arriving
 * through a different door.
 *
 * Idempotent: only rows with `scored_day_close is null` are touched, so the EOD
 * cron and the on-read close-capture firing together record once. Returns rows
 * recorded.
 */
export async function recordScoredDayCloses(
  admin: SupabaseClient<Database>,
  dateKey: string,
): Promise<number> {
  const { data: pending } = await admin
    .from("ai_analyses")
    .select("id, ticker, exchange")
    .eq("date", dateKey)
    .is("scored_day_close", null);
  if (!pending || pending.length === 0) return 0;

  const quotes = await fetchQuotes(
    pending.map((r) => ({ ticker: r.ticker, exchange: r.exchange ?? null })),
  );

  let recorded = 0;
  for (const row of pending) {
    const q = quotes.get(row.ticker);
    if (q == null) continue; // unresolvable today; stays null for a later run
    const { error } = await admin
      .from("ai_analyses")
      .update({
        scored_day_close: q.close,
        scored_day_change_percent: q.changePercent,
      })
      .eq("id", row.id)
      .is("scored_day_close", null);
    if (error) {
      console.error(`[outcomes] scored-day close ${row.ticker} failed:`, error.message);
    } else {
      recorded++;
    }
  }
  if (recorded > 0) {
    console.log(
      `[outcomes] recorded ${recorded}/${pending.length} scored-day closes for ${dateKey}`,
    );
  }
  return recorded;
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
    .select("id, ticker, exchange, scored_day_close")
    .eq("date", prevKey)
    .not("short_score", "is", null)
    .is("next_close", null);
  if (!pending || pending.length === 0) return 0;

  // Baseline = the scored session's own close, carried on the thesis row by
  // recordScoredDayCloses. Reading it here rather than from daily_gainers is
  // the fix for the silent exclusion described on that function.
  const prevClose = new Map<string, number>();
  for (const r of pending) {
    if (r.scored_day_close != null && r.scored_day_close > 0) {
      prevClose.set(r.ticker, r.scored_day_close);
    }
  }

  // Rows scored before that column existed have no baseline of their own — fall
  // back to the finalized board, the old path. Transitional only, and it keeps
  // the old blind spot: a ticker absent from the finalized board still resolves
  // to nothing here. New rows never take this branch.
  const legacy = pending.filter((r) => !prevClose.has(r.ticker)).map((r) => r.ticker);
  if (legacy.length > 0) {
    const { data: prevRows } = await admin
      .from("daily_gainers")
      .select("ticker, price")
      .eq("date", prevKey)
      .eq("is_final", true)
      .in("ticker", legacy);
    for (const r of prevRows ?? []) {
      if (r.price != null && r.price > 0) prevClose.set(r.ticker, r.price);
    }
  }

  const quotes = await fetchQuotes(
    pending
      .filter((r) => prevClose.has(r.ticker))
      .map((r) => ({ ticker: r.ticker, exchange: r.exchange ?? null })),
  );

  let recorded = 0;
  for (const row of pending) {
    const prev = prevClose.get(row.ticker);
    const next = quotes.get(row.ticker)?.close;
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
