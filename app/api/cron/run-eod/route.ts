import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { getCachedGainers, persistGainers } from "@/lib/gainers";
import { runEodProcessing } from "@/lib/eod";
import { maybeAlert } from "@/lib/alerts";
import { getTodayET, isTradingDay } from "@/lib/market-calendar";
import { requireCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FETCH_LIMIT = 100;

// Single EOD cron (weekdays 21:05 UTC ≈ just after the 4:00 PM ET close in both
// EST and EDT). Vercel cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req, "run-eod");
  if (unauthorized) return unauthorized;

  const dateKey = getTodayET();

  // No-op on weekends/holidays (Vercel's weekday cron still fires on holidays).
  if (!isTradingDay()) {
    return NextResponse.json({ ok: true, skipped: "non-trading day", date: dateKey });
  }

  const admin = createAdminClient();

  try {
    const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
    const result = await persistGainers(admin, gainers, dateKey, true); // raw, is_final = true

    // The one place a stale feed would do lasting damage: is_final is the
    // number DECA orders actually execute at, and nothing overwrites it later.
    // Refuse the whole run rather than freeze another session's close as ours —
    // streaks and the theses fallback would then be computed off it too. Self-
    // healing: the read path's close-capture still finalizes on the next page
    // load once the provider catches up (`!alreadyFinal` is still true).
    if (result.reason === "stale-session") {
      await maybeAlert(admin, {
        date: dateKey,
        type: "feed_not_rolled",
        subject: `Zenith: feed still on ${result.sessionDate} at EOD (${dateKey})`,
        body:
          `${getProvider().name} returned session ${result.sessionDate} instead of ${dateKey} ` +
          `at the EOD run, so the session gate refused to freeze it as today's official close. ` +
          `${dateKey} is NOT finalized and streaks/theses did not run. A later page load will ` +
          `finalize automatically once the provider rolls over; if this alert repeats, the feed ` +
          `is stuck and the day needs a manual re-run.`,
      });
      return NextResponse.json(
        { ok: false, date: dateKey, error: "provider session mismatch", sessionDate: result.sessionDate },
        { status: 502 },
      );
    }

    // Watchdog: confirm the official close actually locked. An empty provider
    // response (no error, no rows) would leave the day un-finalized otherwise.
    const stored = await getCachedGainers(admin, dateKey);
    const finalized = stored.some((r) => r.is_final);
    if (!finalized) {
      await maybeAlert(admin, {
        date: dateKey,
        type: "eod_not_finalized",
        subject: `Zenith: EOD did not finalize for ${dateKey}`,
        body: `The ${dateKey} EOD cron ran but no is_final row exists — the provider returned ${gainers.length} rows. The screener has no official close for today.`,
      });
    }

    // The partial case the check above is blind to: `some()` is satisfied by a
    // single final row, so a day that finalized MOST rows and left a few
    // holding stale intraday values reads as healthy. That is how AIFU stayed
    // in the 2026-09-04 board at +5.603% on a day it closed -18.58%, and how it
    // then dropped out of calibration unnoticed. Any row here is a fabricated
    // gainer in the product's core table.
    const notFinal = stored.filter((r) => !r.is_final);
    if (finalized && notFinal.length > 0) {
      await maybeAlert(admin, {
        date: dateKey,
        type: "partial_finalize",
        subject: `Zenith: ${notFinal.length} row(s) did not finalize for ${dateKey}`,
        body:
          `${dateKey} finalized, but ${notFinal.length} of ${stored.length} rows still have ` +
          `is_final = false and are serving whatever intraday snapshot they last got:\n\n` +
          notFinal
            .map(
              (r) =>
                `  #${r.rank ?? "?"} ${r.exchange ?? "?"}:${r.ticker} ` +
                `${r.change_percent ?? "?"}% @ ${r.price ?? "?"} (scraped ${r.scraped_at})`,
            )
            .join("\n") +
          `\n\nThese read as real gainers everywhere the board is consumed by rank, and ` +
          `recordThesisOutcomes skips them (it requires is_final), so any thesis on one ` +
          `silently never gets an outcome. Removing the thesis pin in lib/gainers.ts was ` +
          `meant to make this unreachable — if it fired, something re-introduced a row the ` +
          `prune won't touch.`,
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

    // Alert if a finalized day with gainers produced ZERO theses — Pro users
    // would see no analysis. `analyses` only counts ones created this run, so
    // re-check the table to avoid false alarms when theses already existed from
    // the on-read close-capture.
    //
    // Zero rows means the QUANT pipeline failed, not Anthropic: model prose
    // degrades to the template per ticker, so a total model outage still writes
    // five rows. That case is model_prose_degraded instead.
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
          body: `EOD finalized ${gainers.length} gainers for ${dateKey} but 0 AI theses exist. The quant pipeline failed for every ticker — check the scanner, EDGAR, scoring, and the ai_analyses write. This is NOT an Anthropic failure: prose falls back to the template, so a model outage would still produce rows (see model_prose_degraded).`,
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
