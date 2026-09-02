// Listing age — how long the symbol has actually been trading.
//
// The engine had no notion of this, and the gap is not obvious: TradingView
// does NOT null out its moving averages or performance windows for a young
// listing. It silently computes them over whatever bars exist, so a stock with
// four sessions of history still reports an SMA200 and a Perf.Y. That is how a
// thesis can describe "a recovery into a range it already traded this quarter"
// for a company that listed last week.
//
// Two independent sources; the more conservative (younger) answer wins:
//
//  1. Finnhub /stock/profile2 `ipo` — a real listing date, when available.
//     Coverage is incomplete (some nano-caps return an empty profile).
//  2. The performance-window collapse — free, always available, and a direct
//     measure of *usable price history* rather than of corporate age: with
//     under a week of bars, Perf.W / Perf.1M / Perf.3M are all computed over
//     the same data and come back identical. Note this is the only one of the
//     two that survives a de-SPAC or an OTC uplisting, where the company is
//     old but the tape is new.
//
// Finnhub is guarded the way lib/quant/news.ts guards headlines: a bare ticker
// is not an identifier. BIOT's profile resolves to an OTC shell called
// "Relativity Acquisition Corp" with an unrelated IPO date, so a profile whose
// name and venue don't corroborate the scanner's is discarded, not trusted.
//
// No FINNHUB_API_KEY = source 1 is skipped silently, same fail-safe posture as
// the rest of lib/quant/.

import type { Technicals } from "./technicals";
import { namesLikelySameCompany } from "./identity";
import { withRetry } from "../retry";

const REQUEST_TIMEOUT_MS = 8_000;

// Cap the score for anything this new. The evidence is the MEAN, not the hit
// rate: across the live record, sub-90-day listings won 71% of the time and
// still returned -8.8% on average, the only age bucket that is negative. They
// win small and lose catastrophically — the worst trade on record, USDE at
// -99.4%, was a 55-day-old listing that doubled overnight on no float.
export const RECENT_LISTING_DAYS = 30;
// Store the feature out to here so the cap threshold can be re-fit later
// against something wider than the window it guards. Beyond this a listing
// date is not decision-relevant and is not worth a row.
export const CAPTURE_LISTING_DAYS = 90;

/** Usable price history, inferred from collapsed performance windows. */
export type HistoryTier = "lt_1w" | "lt_1m" | "lt_3m";

export interface ListingAge {
  /** Listing date from Finnhub, ISO yyyy-mm-dd. Null when unavailable/rejected. */
  ipo_date: string | null;
  /** Calendar days from listing to the scored session. Null without a date. */
  age_days: number | null;
  /** Upper bound on usable price history from the tape itself. */
  history_tier: HistoryTier | null;
  /** Which sources actually contributed — capture-time provenance. */
  source: "finnhub" | "tape" | "both" | null;
}

/** Same tolerance the scanner's own rounding needs; these are percentages. */
function same(a: number | null | undefined, b: number | null | undefined): boolean {
  return a != null && b != null && Math.abs(a - b) < 1e-6;
}

/**
 * Upper bound on how much price history exists, read off collapsed performance
 * windows. Returns null for an established name (all three windows distinct).
 */
export function historyTier(tech: Technicals | null): HistoryTier | null {
  if (!tech) return null;
  const { perfW, perf1M, perf3M } = tech;
  if (same(perfW, perf1M) && same(perf1M, perf3M)) return "lt_1w";
  if (same(perfW, perf1M)) return "lt_1m";
  if (same(perf1M, perf3M)) return "lt_3m";
  return null;
}

interface FinnhubProfile {
  ipo?: string;
  name?: string;
  exchange?: string;
  ticker?: string;
}

/** Does the profile corroborate the row we're scoring? See the BIOT note above. */
function profileMatches(
  p: FinnhubProfile,
  ticker: string,
  companyName: string | null,
  exchange: string | null,
): boolean {
  // Venue: profile2 spells these out ("NASDAQ NMS - GLOBAL MARKET"), so match
  // on the prefix. An OTC profile for a row the scanner says is NASDAQ is the
  // BIOT failure exactly, and it is never a listing date we want.
  const venue = (p.exchange ?? "").toUpperCase();
  if (exchange && venue && !venue.startsWith(exchange.toUpperCase())) return false;
  if (!exchange && venue.includes("OTC")) return false;

  // Name: the same comparison EDGAR lookups use, so legal-suffix noise and
  // leading articles are handled ("The Elmet Group Co." vs "Elmet Group Co"
  // must match; "General Fusion Group Ltd" vs "Spring Valley Acquisition"
  // must not).
  return namesLikelySameCompany(companyName, p.name ?? null);
}

/** Finnhub listing date, or null when missing, stale-keyed, or unverifiable. */
async function fetchListingDate(
  ticker: string,
  companyName: string | null,
  exchange: string | null,
): Promise<string | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  try {
    const get = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${key}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`finnhub returned ${res.status}`);
        return (await res.json()) as FinnhubProfile;
      } finally {
        clearTimeout(timeout);
      }
    };

    const profile = await withRetry(get, {
      onRetry: (err, attempt, delay) =>
        console.warn(`[listing] retry ${attempt} in ${Math.round(delay)}ms:`, (err as Error)?.message),
    });
    if (!profile?.ipo || !/^\d{4}-\d{2}-\d{2}$/.test(profile.ipo)) return null;
    if (!profileMatches(profile, ticker, companyName, exchange)) {
      console.warn(
        `[listing] profile mismatch for ${ticker}: scanner says "${companyName}" on ${exchange}, ` +
          `Finnhub says "${profile.name}" on ${profile.exchange} — ignoring its IPO date`,
      );
      return null;
    }
    return profile.ipo;
  } catch (err) {
    console.warn(`[listing] ${ticker}: ${(err as Error)?.message}`);
    return null;
  }
}

/**
 * Listing age for one scored row. Never throws — every source degrades to null
 * independently, and an all-null result means "no reason to think this is new",
 * which is the same posture the engine had before this existed.
 */
export async function detectListingAge(
  ticker: string,
  dateKey: string,
  companyName: string | null,
  exchange: string | null,
  tech: Technicals | null,
): Promise<ListingAge> {
  const tier = historyTier(tech);
  const ipo = await fetchListingDate(ticker, companyName, exchange);

  let ageDays: number | null = null;
  if (ipo) {
    const days = Math.round(
      (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${ipo}T00:00:00Z`)) / 86_400_000,
    );
    // A listing date after the session we're scoring is nonsense — a bad record
    // or the wrong company. Drop it rather than reporting a negative age.
    ageDays = Number.isFinite(days) && days >= 0 ? days : null;
  }

  const source =
    ipo && ageDays != null && tier ? "both" : ipo && ageDays != null ? "finnhub" : tier ? "tape" : null;

  return { ipo_date: ageDays != null ? ipo : null, age_days: ageDays, history_tier: tier, source };
}

/** Upper bound in days that each tape tier implies. */
const TIER_DAYS: Record<HistoryTier, number> = { lt_1w: 7, lt_1m: 30, lt_3m: 90 };

/**
 * The one number both the cap and the badge key off: an upper bound on how many
 * days this symbol has been trading. The tape wins when the two disagree, which
 * is the de-SPAC and OTC-uplisting case — an old IPO date on a brand-new price
 * history, where it is the history that makes the setup dangerous.
 *
 * Null means established, or nothing known, which score identically.
 */
export function effectiveAgeDays(a: ListingAge | null): number | null {
  if (!a) return null;
  const fromTape = a.history_tier ? TIER_DAYS[a.history_tier] : null;
  const candidates = [a.age_days, fromTape].filter((v): v is number => v != null);
  return candidates.length ? Math.min(...candidates) : null;
}

/** Recent enough to cap the score and earn the badge — one threshold, both uses. */
export function isRecentListing(a: ListingAge | null): boolean {
  const age = effectiveAgeDays(a);
  return age != null && age <= RECENT_LISTING_DAYS;
}

/** Worth persisting. Beyond this a listing date tells us nothing we act on. */
export function isCaptureWorthy(a: ListingAge | null): boolean {
  const age = effectiveAgeDays(a);
  return age != null && age <= CAPTURE_LISTING_DAYS;
}
