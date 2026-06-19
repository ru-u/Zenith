import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { persistGainers } from "@/lib/gainers";
import { runEodProcessing } from "@/lib/eod";
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

    // Streaks + AI theses off the cleaned set (frozen repeats removed). Shared
    // with the on-read close-capture; best-effort so a failure here doesn't fail
    // the cron once gainers have persisted.
    let analyses = 0;
    try {
      analyses = await runEodProcessing(admin, dateKey);
    } catch (eodErr) {
      console.error("[cron/run-eod] eod step:", (eodErr as Error)?.message);
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
