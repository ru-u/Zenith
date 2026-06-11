import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import {
  getCachedGainers,
  getLatestGainersDate,
  latestScrapedAt,
  persistGainers,
} from "@/lib/gainers";
import {
  getTodayET,
  getMarketStatus,
  getMarketSession,
  isDataStale,
} from "@/lib/market-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FETCH_LIMIT = 100;
const FRESHNESS_MINUTES = 10;

export async function GET() {
  const admin = createAdminClient();
  const dateKey = getTodayET();

  let servedDate = dateKey;
  let rows = await getCachedGainers(admin, dateKey);
  let asOf = latestScrapedAt(rows);

  const alreadyFinal = rows.some((r) => r.is_final);

  // Only scrape during the REGULAR session (9:30 AM–4:00 PM ET) — never
  // pre-market or after-hours, since DECA orders execute at the close. Outside
  // those hours (and on weekends/holidays) we serve the last stored day, and a
  // finalized day stays frozen.
  const isOpen = getMarketSession() === "open";
  const shouldFetch =
    isOpen &&
    !alreadyFinal &&
    (rows.length === 0 || isDataStale(asOf, FRESHNESS_MINUTES));

  if (shouldFetch) {
    // Thundering-herd guard: only the caller that wins the atomic claim fetches.
    // `as never` works around supabase-js overload resolution against our
    // hand-written Functions type; the runtime args are correct.
    const { data: won } = await admin.rpc("claim_fetch", {
      p_key: `gainers:${dateKey}`,
      p_ttl_seconds: 30,
    } as never);

    if (won) {
      try {
        const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
        await persistGainers(admin, gainers, dateKey, false);
        rows = await getCachedGainers(admin, dateKey);
        asOf = latestScrapedAt(rows);
      } catch (err) {
        // Provider failed (TradingView block, timeout, etc.) — serve last cache,
        // flagged stale. Never 500.
        if (!(err instanceof ProviderError)) throw err;
        console.error("[/api/gainers] provider error:", err.message);
      }
    }
  }

  // Nothing for today (weekend/holiday/before the first scrape of a new day) —
  // serve the most recent stored day so the page isn't empty, WITHOUT creating
  // a row for a non-trading day.
  if (rows.length === 0) {
    const latest = await getLatestGainersDate(admin);
    if (latest && latest !== dateKey) {
      rows = await getCachedGainers(admin, latest);
      asOf = latestScrapedAt(rows);
      servedDate = latest;
    }
  }

  const isFinal = rows.some((r) => r.is_final);
  const status = getMarketStatus({
    isFinal,
    scrapedAt: asOf,
    isToday: servedDate === dateKey,
  });

  return NextResponse.json(
    {
      date: servedDate,
      asOf,
      stale: isDataStale(asOf, FRESHNESS_MINUTES),
      status,
      gainers: rows,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
