import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import type { GainerRow } from "@/lib/marketdata";
import { getCleanedGainers, persistGainers } from "@/lib/gainers";
import { updateStreaks } from "@/lib/streaks";
import { generateAndStoreTopAnalyses } from "@/lib/claude";
import { getTodayET, isTradingDay } from "@/lib/market-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FETCH_LIMIT = 100;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Single EOD cron (weekdays 21:05 UTC ≈ just after the 4:00 PM ET close in both
// EST and EDT). Vercel cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dateKey = getTodayET();

  // No-op on weekends/holidays (Vercel's weekday cron still fires on holidays).
  if (!isTradingDay()) {
    return NextResponse.json({ ok: true, skipped: "non-trading day", date: dateKey });
  }

  const admin = createAdminClient();

  try {
    const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
    await persistGainers(admin, gainers, dateKey, true); // raw, is_final = true

    // Clean frozen repeats (halted stocks) before streaks + AI so they neither
    // accrue streaks nor get theses.
    const cleaned = await getCleanedGainers(admin, dateKey);
    await updateStreaks(
      admin,
      cleaned.map((g) => g.ticker),
      dateKey,
    );
    const cleanedRows: GainerRow[] = cleaned.map((g, i) => ({
      ticker: g.ticker,
      companyName: g.company_name,
      price: g.price,
      changePercent: g.change_percent,
      volume: g.volume,
      relativeVolume: g.relative_volume,
      marketCap: g.market_cap,
      sector: g.sector,
      rank: i + 1,
    }));

    // Generate Sonnet short theses for the top 6 (best-effort — a failure here
    // must not fail the cron, since gainers + streaks already persisted).
    let analyses = 0;
    try {
      analyses = await generateAndStoreTopAnalyses(admin, cleanedRows, dateKey, 5);
    } catch (aiErr) {
      console.error("[cron/run-eod] AI step:", (aiErr as Error)?.message);
    }

    return NextResponse.json({
      ok: true,
      date: dateKey,
      count: gainers.length,
      analyses,
      provider: getProvider().name,
    });
  } catch (err) {
    const message =
      err instanceof ProviderError ? err.message : (err as Error)?.message;
    console.error("[cron/run-eod]", message);
    return NextResponse.json(
      { ok: false, date: dateKey, error: message },
      { status: 502 },
    );
  }
}
