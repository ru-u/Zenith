import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { getCachedGainers, persistGainers } from "@/lib/gainers";
import { runEodProcessing } from "@/lib/eod";
import { maybeAlert } from "@/lib/alerts";
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

    // Watchdog: confirm the official close actually locked. An empty provider
    // response (no error, no rows) would leave the day un-finalized otherwise.
    const finalized = (await getCachedGainers(admin, dateKey)).some((r) => r.is_final);
    if (!finalized) {
      await maybeAlert(admin, {
        date: dateKey,
        type: "eod_not_finalized",
        subject: `Zenith: EOD did not finalize for ${dateKey}`,
        body: `The ${dateKey} EOD cron ran but no is_final row exists — the provider returned ${gainers.length} rows. The screener has no official close for today.`,
      });
    }

    // Streaks + AI theses off the cleaned set (frozen repeats removed). Shared
    // with the on-read close-capture; best-effort so a failure here doesn't fail
    // the cron once gainers have persisted.
    let analyses = 0;
    try {
      analyses = await runEodProcessing(admin, dateKey);
    } catch (eodErr) {
      console.error("[cron/run-eod] eod step:", (eodErr as Error)?.message);
    }

    // Alert if a finalized day with gainers produced ZERO theses (every Claude
    // call failed) — Pro users would see no analysis. `analyses` only counts ones
    // created this run, so re-check the table to avoid false alarms when theses
    // already existed from the on-read close-capture.
    if (finalized) {
      const { count } = await admin
        .from("ai_analyses")
        .select("ticker", { count: "exact", head: true })
        .eq("date", dateKey);
      if (gainers.length > 0 && (count ?? 0) === 0) {
        await maybeAlert(admin, {
          date: dateKey,
          type: "ai_all_failed",
          subject: `Zenith: all AI theses failed for ${dateKey}`,
          body: `EOD finalized ${gainers.length} gainers for ${dateKey} but 0 AI theses exist. Every Claude call likely failed (overload / API key / quota).`,
        });
      }
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
    // Provider failed after all retries on a trading day — the day can't be
    // finalized from this cron run. Email once.
    await maybeAlert(admin, {
      date: dateKey,
      type: "provider_failed",
      subject: `Zenith: market-data provider failed for ${dateKey}`,
      body: `The EOD cron could not fetch gainers from ${getProvider().name} after retries: ${message}. The official close was not captured by the cron.`,
    });
    return NextResponse.json(
      { ok: false, date: dateKey, error: message },
      { status: 502 },
    );
  }
}
