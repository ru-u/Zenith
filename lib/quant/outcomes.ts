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
import { dayRangePct } from "../baseRates";

const REQUEST_TIMEOUT_MS = 8_000;

/** A scanner quote. `changePercent` is the session change, signed. */
export interface Quote {
  close: number;
  changePercent: number | null;
  /** Session high/low — only recordBoardDay needs these, for day_range_pct. */
  high: number | null;
  low: number | null;
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
          // high/low ride along for recordBoardDay's range band; the thesis
          // callers ignore them. One POST either way.
          columns: ["name", "close", "change", "high", "low"],
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
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    if (ticker && !out.has(ticker) && typeof close === "number" && Number.isFinite(close)) {
      out.set(ticker, {
        close,
        // Change is optional: a missing/garbage value must not discard a good
        // close, which is the figure every caller actually depends on. Same for
        // high/low, which only one caller reads at all.
        changePercent: num(change),
        high: num(entry.d[3]),
        low: num(entry.d[4]),
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

/**
 * Snapshot day `dateKey`'s finalized board into `board_outcomes` — the spike-day
 * half of the pair. Runs from `runEodProcessing` after the close has settled.
 *
 * Why a second table rather than columns on daily_gainers: this is calibration
 * data, service-role only, and it must not grow the public board row. Why at all:
 * `historical_gainers` is keyed on Yahoo figures that land a row in a different
 * capBand() 34.4% of the time than the scanner figures `resolveBaseRate` is
 * handed at runtime, and it describes the pre-floor board (only 9 of its 512
 * live-eligible rows are sub-20% gains). These rows are eligible by construction
 * — they reached daily_gainers through isGameEligible — and carry the same
 * numbers production buckets on.
 *
 * Close/cap/relvol/change all come off the finalized board row; the scanner is
 * consulted only for the session high/low that daily_gainers doesn't store. A
 * failed or partial quote is NOT fatal: the row still goes in with a null
 * day_range_pct and simply feeds the range-free rungs of the ladder, which
 * resolveBaseRate already walks. Losing a whole session because the scanner
 * hiccuped would cost more than losing one dimension of it.
 *
 * Idempotent via `unique (date, ticker)` + ignoreDuplicates, so a re-run never
 * disturbs a row the outcome pass has already stamped.
 */
export async function recordBoardDay(
  admin: SupabaseClient<Database>,
  dateKey: string,
): Promise<number> {
  const { data: board } = await admin
    .from("daily_gainers")
    .select("ticker, exchange, price, change_percent, market_cap, relative_volume, sector, rank")
    .eq("date", dateKey)
    .eq("is_final", true);
  if (!board || board.length === 0) return 0;

  const quotes = await fetchQuotes(
    board.map((r) => ({ ticker: r.ticker, exchange: r.exchange ?? null })),
  );

  const rows = board.map((r) => {
    const q = quotes.get(r.ticker);
    return {
      date: dateKey,
      ticker: r.ticker,
      exchange: r.exchange ?? null,
      // The finalized board price is the official close this table is keyed to;
      // the quote is only a range source and may lag it by a tick.
      close: r.price,
      high: q?.high ?? null,
      low: q?.low ?? null,
      day_range_pct: dayRangePct(q?.high ?? null, q?.low ?? null),
      change_percent: r.change_percent,
      market_cap: r.market_cap,
      relative_volume: r.relative_volume,
      sector: r.sector,
      rank: r.rank,
    };
  });

  const { error } = await admin
    .from("board_outcomes")
    .upsert(rows, { onConflict: "date,ticker", ignoreDuplicates: true });
  if (error) {
    console.error(`[outcomes] board snapshot ${dateKey} failed:`, error.message);
    return 0;
  }
  const withRange = rows.filter((r) => r.day_range_pct != null).length;
  console.log(
    `[outcomes] snapshotted ${rows.length} board rows for ${dateKey} (${withRange} with a range band)`,
  );
  return rows.length;
}

/**
 * Stamp the previous trading day's `board_outcomes` rows with today's close —
 * the outcome half. Runs from `runEodProcessing` on day D, so "today's close" is
 * the correct next-session close for day D-1, exactly as in recordThesisOutcomes.
 * Never call it intraday.
 *
 * The baseline lives on the row itself (`close`, written by recordBoardDay), so
 * unlike the thesis path there is no daily_gainers join to go wrong: a ticker
 * that left the board entirely still resolves. Idempotent — only rows with a
 * null `next_close` are touched.
 */
export async function recordBoardOutcomes(
  admin: SupabaseClient<Database>,
  dateKey: string,
): Promise<number> {
  const [y, m, d] = dateKey.split("-").map(Number);
  const prevKey = tradingDaysAgoKey(2, new Date(Date.UTC(y, m - 1, d, 12)));
  if (prevKey === dateKey) return 0;

  const { data: pending } = await admin
    .from("board_outcomes")
    .select("id, ticker, exchange, close")
    .eq("date", prevKey)
    .is("next_close", null);
  if (!pending || pending.length === 0) return 0;

  const resolvable = pending.filter((r) => r.close != null && r.close > 0);
  const quotes = await fetchQuotes(
    resolvable.map((r) => ({ ticker: r.ticker, exchange: r.exchange ?? null })),
  );

  let recorded = 0;
  for (const row of resolvable) {
    const prev = row.close as number;
    const next = quotes.get(row.ticker)?.close;
    if (next == null) continue; // unresolvable today; stays null for a later run
    const { error } = await admin
      .from("board_outcomes")
      .update({
        next_date: dateKey,
        next_close: next,
        next_day_return: (next - prev) / prev,
        next_day_down: next < prev,
      })
      .eq("id", row.id)
      .is("next_close", null);
    if (error) {
      console.error(`[outcomes] board outcome ${row.ticker} failed:`, error.message);
    } else {
      recorded++;
    }
  }
  if (recorded > 0) {
    console.log(
      `[outcomes] recorded ${recorded}/${pending.length} board outcomes for ${prevKey}`,
    );
  }
  return recorded;
}
