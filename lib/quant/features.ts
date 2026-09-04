// Candidate-signal snapshot, captured with every thesis but NOT scored.
// September's re-fit joins these against realized outcomes (lib/quant/outcomes.ts)
// and promotes only the signals the data supports — the discipline the APLM
// 8/10 miss taught: it was a 2-day serial runner recovering into a range it had
// traded three weeks earlier, and the engine both ignored the streak
// (D_STREAK_PER_DAY = 0) and couldn't see the levels at all.
//
// Three deliberate exceptions leave this file as a live input: `pinned` feeds
// the pinned-tape safety cap in score.ts, `sector.is_sector_move` feeds the
// macro/sector cap, and `listing` feeds the recent-listing cap (a cap, like
// the buyout cap, can only prevent bad recommendations). Everything else is
// storage-only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import type { GainerRow } from "../marketdata/types";
import type { BaseRate } from "../baseRates";
import type { Technicals } from "./technicals";
import { detectListingAge, isCaptureWorthy, type ListingAge } from "./listing";
import { SCAN_URL, USER_AGENT } from "../marketdata/tradingview";
import { withRetry } from "../retry";
import { tradingDaysAgoKey } from "../market-calendar";
import { fetchShortVolumeRatios } from "./finra";

export interface PathFeatures {
  /** Close's position inside the 1M / 3M high-low range, 0..1. */
  range_position_1m: number | null;
  range_position_3m: number | null;
  /** % upside from today's close to the 3M high — room before "price memory". */
  headroom_to_prior_peak_pct: number | null;
  /** Fraction of the 3M drawdown (peak → 1M low) recovered by today's close, 0..1. */
  retracement_fraction: number | null;
  /** Today printed (within 0.5%) the highest price of the past 3 months. */
  is_new_high_3m: boolean | null;
  perf_w: number | null;
  perf_1m: number | null;
  perf_3m: number | null;
}

export interface PinnedTape {
  /** Gap-dominated move that then went flat — the deal-price signature. */
  pinned: boolean;
  /** Day's high-low travel as a fraction of the day's change (lower = more pinned). */
  intensity: number | null;
}

export interface SerialRunnerFeatures {
  /** Gainer-board appearances in the ~30 trading days before today. */
  appearances_30d: number;
  /** Largest of those prior spikes, %. */
  max_prior_spike_pct: number | null;
  /** Most recent prior appearance (date key), if any. */
  last_appearance: string | null;
}

export interface PriorCall {
  /** The session Zenith last scored this ticker. */
  date: string;
  score: number;
  /**
   * What the stock did after that call, in percent, stated from the SHORT's
   * side: negative means the call went against the short. Null only when the
   * outcome recorder has not run and the prior call was not the immediately
   * preceding session.
   */
  realized_percent: number | null;
  /** Sessions between that call and this one. */
  sessions_ago: number;
}

export interface SectorContext {
  sector: string;
  /** Day change % of each mapped proxy ETF that the scanner returned. */
  proxy_moves: { symbol: string; change_pct: number }[];
  max_proxy_change_pct: number | null;
  /** Same-sector names on today's gainer board (incl. this one). */
  same_sector_on_board: number;
  /** The whole sector is in motion — the spike has macro fuel, not hype. */
  is_sector_move: boolean;
}

export interface FeatureSnapshot {
  path: PathFeatures;
  /**
   * How long the symbol has actually been trading. Null when it is old enough
   * not to matter — a listing date for a four-year-old biotech is not a fact
   * worth a row. Feeds the score cap in score.ts, unlike most of this struct.
   */
  listing: ListingAge | null;
  pinned_tape: PinnedTape;
  serial: SerialRunnerFeatures | null;
  /** FINRA short volume / total volume for the prior session, 0..1. */
  finra_short_ratio: number | null;
  streak_count: number | null;
  /**
   * Zenith's own most recent call on this ticker, and how it turned out. The
   * engine had no memory of its own record: SWVL was scored 9/10, closed 32.6%
   * HIGHER, and was scored again the next session with no reference to that.
   * Display-only — a prior miss does not predict a worse outcome (repeat calls
   * after a loss still won 70% of the time, mean +4.4%), so it informs the
   * reader rather than the score.
   */
  prior_call: PriorCall | null;
  base_rate_bucket: { cap_band: string; relvol_band: string; n: number } | null;
  sector: SectorContext | null;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Where today's move sits on the recent graph — levels, not patterns. */
export function computePathFeatures(g: GainerRow, tech: Technicals | null): PathFeatures {
  const close = g.price ?? null;
  const h1 = tech?.high1M ?? null;
  const l1 = tech?.low1M ?? null;
  const h3 = tech?.high3M ?? null;
  const l3 = tech?.low3M ?? null;

  // Windowed highs/lows include today's session, so range positions are capped
  // at 1 by construction; headroom is 0 when today set the high.
  const range1 = close != null && h1 != null && l1 != null ? ratio(close - l1, h1 - l1) : null;
  const range3 = close != null && h3 != null && l3 != null ? ratio(close - l3, h3 - l3) : null;
  const headroom = close != null && h3 != null && close > 0 ? ((h3 - close) / close) * 100 : null;
  const retrace = close != null && h3 != null && l1 != null ? ratio(close - l1, h3 - l1) : null;
  const newHigh =
    tech?.dayHigh != null && h3 != null ? tech.dayHigh >= h3 * 0.995 : null;

  return {
    range_position_1m: range1,
    range_position_3m: range3,
    headroom_to_prior_peak_pct: headroom,
    retracement_fraction: retrace != null ? Math.max(0, Math.min(1, retrace)) : null,
    is_new_high_3m: newHigh,
    perf_w: tech?.perfW ?? null,
    perf_1m: tech?.perf1M ?? null,
    perf_3m: tech?.perf3M ?? null,
  };
}

// Pinned-tape thresholds: the move must be material, essentially all gap (the
// price was SET by news, not traded up), and the session's travel collapsed —
// a deal-price signature. Conservative on purpose: false positives would cap
// genuinely shortable runners.
const PINNED_MIN_CHANGE_PCT = 15;
const PINNED_GAP_DOMINANCE = 0.8; // gap ≥ 80% of the day's change
const PINNED_MAX_TRAVEL = 0.15; // day range ≤ 15% of the day's change

/** Deal-price signature from today's tape: big gap, then a dead-flat session. */
export function computePinnedTape(g: GainerRow, tech: Technicals | null): PinnedTape {
  const chg = g.changePercent ?? null;
  const close = g.price ?? null;
  const hi = tech?.dayHigh ?? null;
  const lo = tech?.dayLow ?? null;
  const gap = tech?.gapPercent ?? null;

  if (chg == null || close == null || close <= 0 || hi == null || lo == null) {
    return { pinned: false, intensity: null };
  }
  const rangePct = ((hi - lo) / close) * 100;
  const intensity = chg > 0 ? rangePct / chg : null;
  const pinned =
    chg >= PINNED_MIN_CHANGE_PCT &&
    gap != null &&
    gap >= PINNED_GAP_DOMINANCE * chg &&
    intensity != null &&
    intensity <= PINNED_MAX_TRAVEL;
  return { pinned, intensity };
}

/**
 * Prior gainer-board appearances from our own daily_gainers — the serial-runner
 * signal (APLM: spiked Jun 22, faded, re-ran Jul 14-16). One query for the
 * whole top-N; failure degrades to an empty map.
 */
export async function fetchSerialRunnerFeatures(
  admin: SupabaseClient<Database>,
  tickers: string[],
  dateKey: string,
): Promise<Map<string, SerialRunnerFeatures>> {
  const out = new Map<string, SerialRunnerFeatures>();
  if (tickers.length === 0) return out;
  const [y, m, d] = dateKey.split("-").map(Number);
  const sinceKey = tradingDaysAgoKey(31, new Date(Date.UTC(y, m - 1, d, 12)));

  const { data, error } = await admin
    .from("daily_gainers")
    .select("ticker, date, change_percent")
    .in("ticker", tickers)
    .gte("date", sinceKey)
    .lt("date", dateKey);
  if (error) {
    console.warn("[features] serial-runner query failed:", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const cur = out.get(row.ticker) ?? {
      appearances_30d: 0,
      max_prior_spike_pct: null,
      last_appearance: null,
    };
    cur.appearances_30d++;
    if (row.change_percent != null) {
      cur.max_prior_spike_pct = Math.max(cur.max_prior_spike_pct ?? -Infinity, row.change_percent);
    }
    if (cur.last_appearance == null || row.date > cur.last_appearance) {
      cur.last_appearance = row.date;
    }
    out.set(row.ticker, cur);
  }
  return out;
}

// Sector → proxy ETFs with day-change thresholds (%). A mapped proxy clearing
// its threshold marks the whole sector "in motion": the spike has a macro
// driver (the commodity), not company hype — the SKYQ failure (2026-07-23: oil
// jumped on Middle East strikes, EDGAR/news found nothing, the engine called
// it momentum and scored 8/10). Deliberately mapped for commodity-linked
// sectors only, where a macro driver routinely moves single names double
// digits; unmapped sectors skip the ETF leg.
const SECTOR_PROXIES: Record<string, { symbol: string; threshold: number }[]> = {
  "Energy Minerals": [
    { symbol: "USO", threshold: 3.0 },
    { symbol: "XLE", threshold: 2.5 },
  ],
  "Non-Energy Minerals": [
    { symbol: "GDX", threshold: 3.0 },
    { symbol: "XME", threshold: 2.5 },
  ],
};
// Same-sector breadth is CAPTURED but does not flag: the board stores ~100
// rows/day, so a handful of same-sector names is routine noise (Health
// Technology alone ran 22 on 2026-07-23). If the September re-fit finds a
// breadth level that predicts outcomes, promote it then.

const ETF_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Day change % for the proxy ETFs — same scanner + posture as outcomes.ts,
 * but AMEX-prefixed: the funds list on NYSE Arca, so the NASDAQ:/NYSE:
 * prefixes used for stocks would silently return nothing.
 */
async function fetchEtfChanges(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (symbols.length === 0) return out;

  const post = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ETF_REQUEST_TIMEOUT_MS);
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
            tickers: symbols.map((s) => `AMEX:${s}`),
            query: { types: [] },
          },
          columns: ["name", "change"],
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

  try {
    const json = await withRetry(post, {
      onRetry: (err, attempt, delay) =>
        console.warn(
          `[features] ETF retry ${attempt} in ${Math.round(delay)}ms:`,
          (err as Error)?.message,
        ),
    });
    for (const entry of json.data ?? []) {
      const name = (entry.d[0] as string) ?? entry.s.split(":").pop();
      const change = entry.d[1];
      if (name && typeof change === "number" && Number.isFinite(change)) {
        out.set(name, change);
      }
    }
  } catch (err) {
    console.warn("[features] sector ETF fetch failed:", (err as Error)?.message);
  }
  return out;
}

/** Same-day sector counts on the gainer board; failure degrades to empty. */
async function fetchSectorBreadth(
  admin: SupabaseClient<Database>,
  sectors: string[],
  dateKey: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sectors.length === 0) return out;
  const { data, error } = await admin
    .from("daily_gainers")
    .select("sector")
    .eq("date", dateKey)
    .in("sector", sectors);
  if (error) {
    console.warn("[features] sector breadth query failed:", error.message);
    return out;
  }
  for (const row of data ?? []) {
    if (row.sector) out.set(row.sector, (out.get(row.sector) ?? 0) + 1);
  }
  return out;
}

function computeSectorContext(
  sector: string | null,
  etfChanges: Map<string, number>,
  sectorCounts: Map<string, number>,
): SectorContext | null {
  if (!sector) return null;
  const proxies = SECTOR_PROXIES[sector] ?? [];
  const proxy_moves = proxies
    .filter((p) => etfChanges.has(p.symbol))
    .map((p) => ({ symbol: p.symbol, change_pct: etfChanges.get(p.symbol)! }));
  const max_proxy_change_pct = proxy_moves.length
    ? Math.max(...proxy_moves.map((m) => m.change_pct))
    : null;
  const same_sector_on_board = sectorCounts.get(sector) ?? 0;
  const proxyHit = proxies.some(
    (p) => (etfChanges.get(p.symbol) ?? -Infinity) >= p.threshold,
  );
  return {
    sector,
    proxy_moves,
    max_proxy_change_pct,
    same_sector_on_board,
    is_sector_move: proxyHit,
  };
}

/**
 * Assemble the per-ticker snapshots for a scored set. Every input degrades
 * independently (nulls, empty maps) — feature capture must never block a thesis.
 */
/**
 * Zenith's own last call on each ticker, with its realized outcome.
 *
 * Timing subtlety: at the ~3:30 drop, yesterday's thesis has NOT been stamped
 * with an outcome yet — recordThesisOutcomes runs at today's 4:20 EOD. But
 * today's change_percent IS that outcome, measured intraday: it is exactly the
 * close-to-now move since the session we scored. So the stored value is used
 * when it exists, and today's own move stands in when the prior call was the
 * immediately preceding session. Both are the same quantity.
 */
export async function fetchPriorCalls(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
): Promise<Map<string, PriorCall>> {
  const out = new Map<string, PriorCall>();
  const tickers = gainers.map((g) => g.ticker);
  if (tickers.length === 0) return out;

  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const sinceKey = tradingDaysAgoKey(11, probe);
  const prevSession = tradingDaysAgoKey(2, probe);

  const { data, error } = await admin
    .from("ai_analyses")
    .select("ticker, date, short_score, next_change_percent")
    .in("ticker", tickers)
    .gte("date", sinceKey)
    .lt("date", dateKey)
    .order("date", { ascending: false });
  if (error) {
    console.warn("[features] prior-call query failed:", error.message);
    return out;
  }

  const changeByTicker = new Map(gainers.map((g) => [g.ticker, g.changePercent ?? null]));
  for (const row of data ?? []) {
    if (out.has(row.ticker) || row.short_score == null) continue; // ordered desc: first is newest
    const todayMove = changeByTicker.get(row.ticker) ?? null;
    const realized =
      row.next_change_percent != null
        ? -row.next_change_percent
        : row.date === prevSession && todayMove != null
          ? -todayMove
          : null;
    out.set(row.ticker, {
      date: row.date,
      score: row.short_score,
      realized_percent: realized,
      sessions_ago: row.date === prevSession ? 1 : 0,
    });
  }
  return out;
}

export async function buildFeatureSnapshots(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
  techs: Map<string, Technicals>,
  streaks: Map<string, number>,
  baseRates: Map<string, BaseRate | null>,
): Promise<Map<string, FeatureSnapshot>> {
  const tickers = gainers.map((g) => g.ticker);
  const sectors = [
    ...new Set(gainers.map((g) => g.sector).filter((s): s is string => !!s)),
  ];
  const proxySymbols = [
    ...new Set(sectors.flatMap((s) => SECTOR_PROXIES[s] ?? []).map((p) => p.symbol)),
  ];
  const [serial, shortRatios, etfChanges, sectorCounts, priorCalls, listings] = await Promise.all([
    fetchSerialRunnerFeatures(admin, tickers, dateKey),
    fetchShortVolumeRatios(tickers, dateKey),
    fetchEtfChanges(proxySymbols),
    fetchSectorBreadth(admin, sectors, dateKey),
    fetchPriorCalls(admin, gainers, dateKey),
    // One Finnhub profile call per scored ticker (five a day) — well inside the
    // free tier the headline fallback already shares.
    Promise.all(
      gainers.map((g) =>
        detectListingAge(g.ticker, dateKey, g.companyName ?? null, g.exchange, techs.get(g.ticker) ?? null),
      ),
    ).then((rows) => new Map(gainers.map((g, i) => [g.ticker, rows[i]]))),
  ]);

  const out = new Map<string, FeatureSnapshot>();
  for (const g of gainers) {
    const tech = techs.get(g.ticker) ?? null;
    const br = baseRates.get(g.ticker) ?? null;
    const age = listings.get(g.ticker) ?? null;
    out.set(g.ticker, {
      path: computePathFeatures(g, tech),
      listing: isCaptureWorthy(age) ? age : null,
      pinned_tape: computePinnedTape(g, tech),
      serial: serial.get(g.ticker) ?? null,
      finra_short_ratio: shortRatios.get(g.ticker) ?? null,
      streak_count: streaks.get(g.ticker) ?? null,
      prior_call: priorCalls.get(g.ticker) ?? null,
      base_rate_bucket: br
        ? { cap_band: br.cap_band, relvol_band: br.relvol_band, n: br.n }
        : null,
      sector: computeSectorContext(g.sector, etfChanges, sectorCounts),
    });
  }
  return out;
}
