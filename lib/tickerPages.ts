import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBaseRate, type BaseRate } from "@/lib/baseRates";
import type { DailyGainer } from "@/lib/supabase/types";

// Data behind the public /stock/[ticker] pages.
//
// WHAT THESE PAGES MAY AND MAY NOT SAY. History is what Zenith Pro sells
// ("Unlimited history: all of Zenith's past trading days", lib/pricing.ts), so
// these pages carry AGGREGATES ONLY: how many times a ticker has appeared, the
// first and last date of that range, typical figures across those appearances,
// and the base rate for its bucket. They must never render the per-session
// list — a date with its rank, price and change% is the archive itself, and
// publishing it would make the Pro bullet false. If you add a field here, ask
// whether it reconstructs a past board. If it does, it doesn't belong.
//
// WHY THE BAR IS HIGH. 2,134 tickers have hit the board and 1,286 have done it
// twice, but the material that makes a page worth reading is thin: 83 base-rate
// buckets shared across every ticker in a bucket, 20 sectors, and 947 of 1,000
// streaks sitting at 1. A ticker with two appearances yields a page that is a
// template with a name swapped in, and ~1,300 of those on a domain with eight
// URLs is what Google's scaled-content-abuse policy is aimed at — with
// site-wide, not page-level, consequences. Eight appearances means the ticker
// genuinely recurs and the page has something of its own to say. Raise or lower
// deliberately, and re-run scripts/seo-inventory.mjs first.
export const MIN_BOARD_APPEARANCES = 8;

export interface TickerProfile {
  ticker: string;
  companyName: string | null;
  exchange: string | null;
  sector: string | null;
  appearances: number;
  /** Range only — never the dates in between. */
  firstDate: string;
  lastDate: string;
  /** Typical one-day gain on the sessions it appeared. */
  medianChangePercent: number | null;
  medianMarketCap: number | null;
  medianRelVolume: number | null;
  /** Longest run of consecutive sessions on the board. */
  bestStreak: number | null;
  baseRate: BaseRate | null;
}

function median(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Appearance counts need a GROUP BY, which PostgREST doesn't expose without a
// view or RPC — and a migration has to be run by hand against the live database
// (CLAUDE.md), so this counts client-side instead and memoizes the result.
//
// PER-PROCESS, same single-replica assumption as lib/ratelimit.ts and the
// warm-up probe in /api/gainers. The set only changes when a session is
// finalized, so a stale entry costs at most a day's new tickers, and a deploy
// clears it.
const QUALIFY_TTL_MS = 6 * 60 * 60 * 1000;
let qualifyCache: { at: number; tickers: Set<string> } | null = null;

async function countAppearances(): Promise<Map<string, number>> {
  const db = createAdminClient();
  const counts = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("daily_gainers")
      .select("ticker")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) counts.set(r.ticker, (counts.get(r.ticker) ?? 0) + 1);
    if (data.length < PAGE) return counts;
  }
}

/** Tickers with enough board history to earn a page. Sorted, stable. */
export async function qualifyingTickers(): Promise<string[]> {
  if (qualifyCache && Date.now() - qualifyCache.at < QUALIFY_TTL_MS) {
    return [...qualifyCache.tickers].sort();
  }
  const counts = await countAppearances();
  const tickers = new Set(
    [...counts.entries()]
      .filter(([, n]) => n >= MIN_BOARD_APPEARANCES)
      .map(([t]) => t),
  );
  qualifyCache = { at: Date.now(), tickers };
  return [...tickers].sort();
}

/** Aggregate profile, or null when the ticker hasn't earned a page. */
export async function tickerProfile(
  ticker: string,
): Promise<TickerProfile | null> {
  const db = createAdminClient();

  const { data: rows, error } = await db
    .from("daily_gainers")
    .select("*")
    .eq("ticker", ticker)
    .order("date", { ascending: true });
  if (error) throw error;

  const board = (rows ?? []) as DailyGainer[];
  if (board.length < MIN_BOARD_APPEARANCES) return null;

  const [{ data: streak }, { data: rates }] = await Promise.all([
    db
      .from("ticker_streaks")
      .select("streak_count")
      .eq("ticker", ticker)
      .maybeSingle<{ streak_count: number }>(),
    db.from("gainer_base_rates").select("*"),
  ]);

  const latest = board[board.length - 1];
  const medianMarketCap = median(board.map((r) => r.market_cap));
  const medianRelVolume = median(board.map((r) => r.relative_volume));

  return {
    ticker,
    // Latest non-null wins: early rows predate some columns, and a company can
    // be renamed. The most recent scrape is the current truth.
    companyName: [...board].reverse().find((r) => r.company_name)?.company_name ?? null,
    exchange: [...board].reverse().find((r) => r.exchange)?.exchange ?? null,
    sector: [...board].reverse().find((r) => r.sector)?.sector ?? null,
    appearances: board.length,
    firstDate: board[0].date,
    lastDate: latest.date,
    medianChangePercent: median(board.map((r) => r.change_percent)),
    medianMarketCap,
    medianRelVolume,
    bestStreak: streak?.streak_count ?? null,
    // The bucket its typical appearance lands in. No range band: day high/low
    // isn't stored on daily_gainers, so this resolves on cap x relvol and the
    // chain in resolveBaseRate degrades from there.
    baseRate: resolveBaseRate(
      (rates ?? []) as BaseRate[],
      medianMarketCap,
      medianRelVolume,
      null,
    ),
  };
}
