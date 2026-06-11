import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import {
  getCachedGainers,
  latestScrapedAt,
  persistGainers,
} from "@/lib/gainers";
import {
  getTodayET,
  getMarketStatus,
  isDataStale,
} from "@/lib/market-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FETCH_LIMIT = 100;
const FRESHNESS_MINUTES = 10;

export async function GET() {
  const admin = createAdminClient();
  const dateKey = getTodayET();

  let rows = await getCachedGainers(admin, dateKey);
  let asOf = latestScrapedAt(rows);
  const fresh = rows.length > 0 && !isDataStale(asOf, FRESHNESS_MINUTES);

  if (!fresh) {
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
    // Losers (and post-failure) fall through with whatever cache we have.
  }

  const isFinal = rows.some((r) => r.is_final);
  const status = getMarketStatus({ isFinal, scrapedAt: asOf, isToday: true });

  return NextResponse.json(
    {
      date: dateKey,
      asOf,
      stale: isDataStale(asOf, FRESHNESS_MINUTES),
      status,
      gainers: rows,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
