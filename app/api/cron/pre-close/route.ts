import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { getCachedGainers, persistGainers } from "@/lib/gainers";
import { runPreCloseProcessing } from "@/lib/eod";
import { maybeAlert } from "@/lib/alerts";
import { getTodayET, isTradingDay } from "@/lib/market-calendar";
import { requireCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FETCH_LIMIT = 100;

// Pre-close "drop": refresh the intraday gainers, generate AI theses for the
// top-N, and email opted-in users (~30 min before the close). The in-process
// scheduler (instrumentation.ts) is the primary trigger; this secured endpoint
// is for manual/external triggers + local testing. Idempotent: theses skip
// existing, the email is deduped once/day.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req, "pre-close");
  if (unauthorized) return unauthorized;

  const dateKey = getTodayET();
  if (!isTradingDay()) {
    return NextResponse.json({ ok: true, skipped: "non-trading day", date: dateKey });
  }

  const admin = createAdminClient();
  try {
    // Refresh so the drop reflects the latest top-N — UNLESS the close is already
    // finalized (never overwrite the official close prices with intraday data).
    const existing = await getCachedGainers(admin, dateKey);
    const alreadyFinal = existing.some((r) => r.is_final);
    if (!alreadyFinal) {
      const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
      await persistGainers(admin, gainers, dateKey, false);
    }

    const analyses = await runPreCloseProcessing(admin, dateKey);
    return NextResponse.json({
      ok: true,
      date: dateKey,
      analyses,
      finalized: alreadyFinal,
      provider: getProvider().name,
    });
  } catch (err) {
    const message =
      err instanceof ProviderError ? err.message : (err as Error)?.message;
    console.error("[cron/pre-close]", message);
    await maybeAlert(admin, {
      date: dateKey,
      type: "provider_failed",
      subject: `Zenith: market-data provider failed for ${dateKey}`,
      body: `The pre-close cron could not fetch gainers from ${getProvider().name} after retries: ${message}. No theses/email for the drop.`,
    });
    return NextResponse.json(
      { ok: false, date: dateKey, error: message },
      { status: 502 },
    );
  }
}
