// Daily closes for the admin track record's diversification sleeve (a stock, a
// mutual fund, a Treasury note) — the one thing the TradingView scanner can't
// give, since it returns a snapshot and the sleeve needs a mark at every past
// close.
//
// The stock and fund come from Yahoo's chart endpoint, which is unofficial and so carries the same ToS
// caveat as the scanner. That is acceptable ONLY because the sole caller is an
// owner-only page: this is not a MarketDataProvider, and nothing public may
// start reading it. It 429s requests without a browser User-Agent.
//
// Mutual funds strike NAV in the evening, so at the ~4:20 ET run-eod the newest
// session has no fund close yet; closeOn() carries the prior one forward and the
// next load after the NAV posts picks it up (the cache is 15 min).
//
// PER-PROCESS cache, same single-replica assumption as lib/ratelimit.ts.

import { getTodayET } from "./market-calendar";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const REQUEST_TIMEOUT_MS = 8_000;
const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; closes: Map<string, number> }>();

type ChartResponse = {
  chart?: {
    result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[];
  };
};

/** ET date → close since `from` (YYYY-MM-DD), or null if the fetch failed. */
export async function fetchDailyCloses(symbol: string, from: string): Promise<Map<string, number> | null> {
  const key = `${symbol}|${from}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.closes;

  // A week of slack before `from` so a holiday on it still has a prior close.
  const [y, m, d] = from.split("-").map(Number);
  const period1 = Math.floor(Date.UTC(y, m - 1, d) / 1000) - 7 * 86_400;
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const u = `${CHART_URL}${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    const res = await fetch(u, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`chart returned ${res.status}`);
    const r = ((await res.json()) as ChartResponse).chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const close = r?.indicators?.quote?.[0]?.close ?? [];
    const closes = new Map<string, number>();
    // Bars are stamped at the session open, so the ET date is the session.
    ts.forEach((t, i) => {
      const c = close[i];
      if (c != null && Number.isFinite(c) && c > 0) closes.set(getTodayET(new Date(t * 1000)), c);
    });
    if (!closes.size) throw new Error("no closes");
    cache.set(key, { at: Date.now(), closes });
    return closes;
  } catch (err) {
    console.error(`[dailyCloses] ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// The bond leg. A bond ETF is not a bond in SMG, and no free source quotes a
// specific Treasury's daily price, so the bond is a new 10-year note bought at
// par on `buyDate` — coupon = that day's 10-year par yield, which is what par
// means — and repriced at each session's 10-year par yield from Treasury's own
// daily yield-curve file (official, free, no key). The constant-maturity yield
// stands in for the note's own, which drifts from it only by the few weeks the
// note has aged.

const TREASURY_CSV = (year: number) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
const yieldCache = new Map<number, { at: number; yields: Map<string, number> }>();

/** ET date → 10-year par yield (%) for `year`, or null if the fetch failed. */
async function fetchTenYearYields(year: number): Promise<Map<string, number> | null> {
  const hit = yieldCache.get(year);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.yields;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(TREASURY_CSV(year), { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`treasury returned ${res.status}`);
    const [head, ...lines] = (await res.text()).trim().split(/\r?\n/);
    const col = head.split(",").findIndex((h) => h.replace(/"/g, "") === "10 Yr");
    if (col < 0) throw new Error("no 10 Yr column");
    const yields = new Map<string, number>();
    for (const line of lines) {
      const cells = line.split(",");
      const [m, d, y] = cells[0].split("/");
      const v = Number(cells[col]);
      if (y && cells[col] !== "" && Number.isFinite(v) && v > 0) yields.set(`${y}-${m}-${d}`, v);
    }
    if (!yields.size) throw new Error("no yields");
    yieldCache.set(year, { at: Date.now(), yields });
    return yields;
  } catch (err) {
    console.error(`[dailyCloses] treasury ${year}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Full value (price + accrued interest) per $1,000 face of a semiannual bond
 * bought at par `elapsedDays` ago, discounted at `yieldPct`. Coupons that fall
 * due before now are skipped — none do inside one SMG season, since the first
 * is six months out. Pure.
 */
export function parBondValue(couponPct: number, years: number, elapsedDays: number, yieldPct: number): number {
  const face = 1000;
  const c = (couponPct / 100 / 2) * face;
  const y = yieldPct / 100 / 2;
  const elapsed = (elapsedDays / 365.25) * 2; // in coupon periods
  let pv = 0;
  for (let k = 1; k <= years * 2; k++) {
    const t = k - elapsed;
    if (t > 0) pv += (c + (k === years * 2 ? face : 0)) / (1 + y) ** t;
  }
  return Math.round(pv * 100) / 100;
}

/** The note's coupon and its value per $1,000 face at each session since
 *  `buyDate`, or null if the yields couldn't be fetched or miss `buyDate`. */
export async function fetchTreasuryNoteCloses(
  buyDate: string,
): Promise<{ couponPct: number; closes: Map<string, number> } | null> {
  const first = Number(buyDate.slice(0, 4));
  const last = Number(getTodayET().slice(0, 4));
  const years = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => fetchTenYearYields(first + i)));
  if (years.some((y) => y == null)) return null;
  const yields = new Map(years.flatMap((y) => [...y!]));
  const couponPct = yields.get(buyDate);
  if (couponPct == null) return null;
  const day = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86_400_000;
  const closes = new Map<string, number>();
  for (const [date, y] of yields) {
    if (date >= buyDate) closes.set(date, parBondValue(couponPct, 10, day(date) - day(buyDate), y));
  }
  return { couponPct, closes };
}
