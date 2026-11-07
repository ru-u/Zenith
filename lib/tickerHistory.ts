import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { BOARD_ROWS } from "./board";
import { cleanStoredGainers, type FrozenRepeatProbe } from "./gainers";
import { isGameEligible, isLikelySplitArtifact } from "./marketdata/normalize";

/**
 * Every past session a ticker made the board — the Pro ticker lookup on
 * /history (`GET /api/gainers/ticker/[ticker]`).
 *
 * PRO ONLY, and it must stay that way. A list of dates with rank and price *is*
 * the archive; lib/tickerPages.ts deliberately publishes aggregates only for the
 * same reason. Do not reuse this from `/stock`.
 *
 * "Made the board" means what the board itself showed, not what is stored: the
 * raw rows go through the same `cleanStoredGainers` chain the per-date read
 * applies (ineligible, split-artifact and frozen-repeat rows dropped, then
 * re-ranked), and only positions inside `BOARD_ROWS` count. Stored rank is NOT
 * the displayed rank — the eligibility filter alone changes rank 1 on ~42% of
 * sessions — so a lookup reading `rank` off the ticker's own rows would list
 * days, and positions, that no /history page shows.
 *
 * Re-ranking is positional, so this needs each session's rows ABOVE the ticker
 * and the prior session's rows for the frozen-repeat probe. Both are fetched as
 * one slim, paged `.in("date", …)` query each rather than per session.
 */

export interface TickerAppearance {
  date: string;
  /** Position on that session's cleaned board — what /history displays. */
  rank: number;
  change_percent: number | null;
  price: number | null;
  market_cap: number | null;
  volume: number | null;
}

export interface TickerHistory {
  ticker: string;
  companyName: string | null;
  /** Newest first. */
  appearances: TickerAppearance[];
}

// Every column cleanStoredGainers reads, plus the ones the result returns.
const BOARD_COLS =
  "date, ticker, rank, price, change_percent, volume, relative_volume, market_cap";
const PROBE_COLS = "date, ticker, price, change_percent, volume";
// Supabase's PostgREST caps a response at 1,000 rows regardless of .limit().
const PAGE = 1000;

type BoardRow = {
  date: string;
  ticker: string;
  rank: number | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  relative_volume: number | null;
  market_cap: number | null;
};
type ProbeRow = FrozenRepeatProbe & { date: string };

/** Page through a query until it comes back short. */
async function paged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function groupByDate<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const by = new Map<string, T[]>();
  for (const r of rows) {
    const list = by.get(r.date);
    if (list) list.push(r);
    else by.set(r.date, [r]);
  }
  return by;
}

/**
 * @param before Exclusive upper bound (YYYY-MM-DD) — today, so the lookup
 *   covers the same past sessions /history lists and never an intraday board.
 */
export async function getTickerHistory(
  db: SupabaseClient<Database>,
  ticker: string,
  before: string,
): Promise<TickerHistory> {
  const { data: own, error } = await db
    .from("daily_gainers")
    .select("date, rank, price, change_percent, relative_volume, market_cap, company_name")
    .eq("ticker", ticker)
    .lt("date", before)
    .order("date", { ascending: false });
  if (error) throw error;

  const companyName = own?.find((r) => r.company_name)?.company_name ?? null;

  // The ticker's own row failing either predicate means cleaning drops it on
  // that date whatever else is on the board — skip the date before fetching it.
  // (Frozen-repeat needs the prior day, so that one waits for the full pass.)
  const candidates = (own ?? []).filter(
    (r) =>
      r.rank != null &&
      isGameEligible(r.price, r.change_percent, r.market_cap) &&
      !isLikelySplitArtifact(r.change_percent, r.relative_volume),
  );
  if (candidates.length === 0) {
    return { ticker, companyName, appearances: [] };
  }

  // Cleaning only ever removes rows, so the displayed position can't be worse
  // than the stored rank: rows ranked below the ticker can't affect it.
  const maxRank = Math.max(...candidates.map((r) => r.rank as number));
  const dates = candidates.map((r) => r.date);

  // The prior stored session for each date — the frozen-repeat baseline, the
  // same one getGainersDateBefore picks. One row per session at rank 1, as
  // app/history/page.tsx lists them.
  const sessions = await paged<{ date: string }>((from, to) =>
    db
      .from("daily_gainers")
      .select("date")
      .eq("rank", 1)
      .lt("date", before)
      .order("date", { ascending: false })
      .range(from, to),
  );
  const order = sessions.map((s) => s.date); // newest first
  const prevOf = new Map<string, string>();
  for (let i = 0; i < order.length - 1; i++) prevOf.set(order[i], order[i + 1]);
  const prevDates = [...new Set(dates.map((d) => prevOf.get(d)).filter((d) => d != null))];

  const [boardRows, probeRows] = await Promise.all([
    paged<BoardRow>((from, to) =>
      db
        .from("daily_gainers")
        .select(BOARD_COLS)
        .in("date", dates)
        .lte("rank", maxRank)
        .order("date", { ascending: true })
        // getCachedGainers' order, so ties resolve exactly as the board does.
        .order("rank", { ascending: true })
        .order("change_percent", { ascending: false })
        .order("ticker", { ascending: true })
        .range(from, to),
    ),
    prevDates.length === 0
      ? Promise.resolve([] as ProbeRow[])
      : paged<ProbeRow>((from, to) =>
          db
            .from("daily_gainers")
            .select(PROBE_COLS)
            .in("date", prevDates)
            .order("date", { ascending: true })
            .order("ticker", { ascending: true })
            .range(from, to),
        ),
  ]);

  const boards = groupByDate(boardRows);
  const probes = groupByDate(probeRows);

  const appearances: TickerAppearance[] = [];
  for (const date of dates) {
    const prev = prevOf.get(date);
    const cleaned = cleanStoredGainers(
      boards.get(date) ?? [],
      prev ? (probes.get(prev) ?? []) : [],
    );
    // Position, not `.rank`: the filters only re-rank when they drop something,
    // and /history numbers rows by position (displayRank = i + 1).
    const idx = cleaned.findIndex((r) => r.ticker === ticker);
    if (idx < 0 || idx >= BOARD_ROWS) continue;
    const r = cleaned[idx];
    appearances.push({
      date,
      rank: idx + 1,
      change_percent: r.change_percent,
      price: r.price,
      market_cap: r.market_cap,
      volume: r.volume,
    });
  }

  return { ticker, companyName, appearances };
}
