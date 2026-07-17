// Candidate-signal snapshot, captured with every thesis but NOT scored.
// September's re-fit joins these against realized outcomes (lib/quant/outcomes.ts)
// and promotes only the signals the data supports — the discipline the APLM
// 8/10 miss taught: it was a 2-day serial runner recovering into a range it had
// traded three weeks earlier, and the engine both ignored the streak
// (D_STREAK_PER_DAY = 0) and couldn't see the levels at all.
//
// One deliberate exception leaves this file as a live input: `pinned` feeds the
// pinned-tape safety cap in score.ts (a cap, like the buyout cap, can only
// prevent bad recommendations). Everything else is storage-only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import type { GainerRow } from "../marketdata/types";
import type { BaseRate } from "../baseRates";
import type { Technicals } from "./technicals";
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

export interface FeatureSnapshot {
  path: PathFeatures;
  pinned_tape: PinnedTape;
  serial: SerialRunnerFeatures | null;
  /** FINRA short volume / total volume for the prior session, 0..1. */
  finra_short_ratio: number | null;
  streak_count: number | null;
  base_rate_bucket: { cap_band: string; relvol_band: string; n: number } | null;
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

/**
 * Assemble the per-ticker snapshots for a scored set. Every input degrades
 * independently (nulls, empty maps) — feature capture must never block a thesis.
 */
export async function buildFeatureSnapshots(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
  techs: Map<string, Technicals>,
  streaks: Map<string, number>,
  baseRates: Map<string, BaseRate | null>,
): Promise<Map<string, FeatureSnapshot>> {
  const tickers = gainers.map((g) => g.ticker);
  const [serial, shortRatios] = await Promise.all([
    fetchSerialRunnerFeatures(admin, tickers, dateKey),
    fetchShortVolumeRatios(tickers, dateKey),
  ]);

  const out = new Map<string, FeatureSnapshot>();
  for (const g of gainers) {
    const tech = techs.get(g.ticker) ?? null;
    const br = baseRates.get(g.ticker) ?? null;
    out.set(g.ticker, {
      path: computePathFeatures(g, tech),
      pinned_tape: computePinnedTape(g, tech),
      serial: serial.get(g.ticker) ?? null,
      finra_short_ratio: shortRatios.get(g.ticker) ?? null,
      streak_count: streaks.get(g.ticker) ?? null,
      base_rate_bucket: br
        ? { cap_band: br.cap_band, relvol_band: br.relvol_band, n: br.n }
        : null,
    });
  }
  return out;
}
