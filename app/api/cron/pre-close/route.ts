import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { getCachedGainers, persistGainers } from "@/lib/gainers";
import { runPreCloseProcessing } from "@/lib/eod";
import { classifyPreCloseFailure, maybeAlert } from "@/lib/alerts";
import { getTodayET, isTradingDay, secondsUntilCloseET } from "@/lib/market-calendar";
import { requireCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FETCH_LIMIT = 100;

/** A thrown PostgREST error is a bare object, not an Error — read it defensively. */
function errText(err: unknown): string {
  return (err as Error)?.message ?? String(err);
}

/**
 * Decide whether a failed tick is worth an ops email, and say only what was
 * verified.
 *
 * The predecessor of this function was a single catch that alerted on the FIRST
 * failed tick with a hardcoded body: "could not fetch gainers from tradingview
 * after retries: <message>. No theses/email for the drop." On 2026-09-09 every
 * clause of that was wrong. The message was `Gateway Timeout`, which no
 * provider error can produce (they are all "scanner returned <status>" or
 * "fetch failed: <msg>") — it was a Supabase 504 surfacing its raw response
 * body through one of the bare `throw error` sites in lib/gainers.ts. And the
 * drop had landed in full 39 seconds later, recovered by the read path.
 *
 * So: read the thesis count back before claiming anything about it, name the
 * stage that actually threw, and let classifyPreCloseFailure hold the alert
 * while later ticks can still recover the day.
 */
async function reportPreCloseFailure(
  admin: SupabaseClient<Database>,
  dateKey: string,
  refreshErr: unknown,
  dropErr: unknown,
): Promise<void> {
  // A second DB failure here must not silence the alert — assume nothing landed.
  let thesisCount = 0;
  try {
    const { count } = await admin
      .from("ai_analyses")
      .select("ticker", { count: "exact", head: true })
      .eq("date", dateKey);
    thesisCount = count ?? 0;
  } catch (e) {
    console.error(`[cron/pre-close] thesis count-back failed (${dateKey}):`, errText(e));
  }

  // The drop's own error is the proximate cause of nothing landing; a failed
  // refresh only matters when the drop then failed too.
  const proximate = dropErr ?? refreshErr;
  const verdict = classifyPreCloseFailure({
    isProviderFault: proximate instanceof ProviderError,
    thesisCount,
    secondsUntilClose: secondsUntilCloseET(),
  });

  const stages = [
    refreshErr ? `refresh: ${errText(refreshErr)}` : null,
    dropErr ? `drop: ${errText(dropErr)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (!verdict.alert) {
    // Not an alert, but it must stay greppable: with the alert suppressed this
    // line is the ONLY record that a tick failed and something recovered it.
    console.warn(
      `[cron/pre-close] failure not alerted (${verdict.reason}) — ${stages}`,
    );
    return;
  }

  const provider = getProvider().name;
  await maybeAlert(admin, {
    date: dateKey,
    type: verdict.type,
    subject:
      verdict.type === "provider_failed"
        ? `Zenith: market-data provider failed at the pre-close drop for ${dateKey}`
        : `Zenith: pre-close drop failed for ${dateKey}`,
    body:
      `The ~3:30 drop for ${dateKey} failed and the retry ticks did not recover it ` +
      `(${verdict.reason}).\n\n` +
      `Stage(s) that threw — ${stages}\n\n` +
      `Theses stored for ${dateKey}, read back after the attempt: ${thesisCount}.\n\n` +
      (verdict.type === "provider_failed"
        ? `The throw was a ProviderError, so ${provider} is the fault and the board ` +
          `is stale as well as the theses missing.`
        : `This is NOT a ${provider} failure — every provider error reads ` +
          `"scanner returned <status>" or "fetch failed: <msg>", so anything else ` +
          `came from further down the drop. A Supabase/PostgREST 5xx arrives here ` +
          `as its raw response body (a bare "Gateway Timeout" is the one seen on ` +
          `2026-09-09). Check Supabase first, then EDGAR/Finnhub.`),
  });
}

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

  // Phase 1 — refresh, so the drop reflects the latest top-N. DELIBERATELY
  // best-effort: whatever is already stored for today came from earlier reads
  // and is still today's board, and this is the one moment of the day the
  // theses have to land. That is the same argument the stale-session branch
  // below has always made; until 2026-09-09 a throw here (a Supabase 504, as it
  // turned out) took the drop down with it instead of being survived.
  let alreadyFinal = false;
  let refreshErr: unknown = null;
  try {
    const existing = await getCachedGainers(admin, dateKey);
    // Never overwrite the official close prices with intraday data.
    alreadyFinal = existing.some((r) => r.is_final);
    if (!alreadyFinal) {
      const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
      const result = await persistGainers(admin, gainers, dateKey, false);
      if (result.reason === "stale-session") {
        // Never expected at 3:30 — the feed's 15-minute delay is a morning
        // problem. Alert, but DON'T skip the drop: whatever is already stored
        // for today came from earlier reads and is still today's board.
        await maybeAlert(admin, {
          date: dateKey,
          type: "feed_not_rolled",
          subject: `Zenith: feed still on ${result.sessionDate} at the pre-close drop (${dateKey})`,
          body:
            `${getProvider().name} returned session ${result.sessionDate} instead of ${dateKey} ` +
            `at the ~3:30 drop, so the refresh was refused by the session gate. The drop is ` +
            `running off the ${existing.length} row(s) already stored for today — check whether ` +
            `those are current before trusting the theses.`,
        });
      }
    }
  } catch (err) {
    refreshErr = err;
    console.error(`[cron/pre-close] refresh failed (${dateKey}):`, errText(err));
  }

  // Phase 2 — the drop itself. Scores off whatever is stored, so it still runs
  // when the refresh above failed; returns 0 when the day has no rows at all.
  let analyses = 0;
  let dropErr: unknown = null;
  try {
    analyses = await runPreCloseProcessing(admin, dateKey);
  } catch (err) {
    dropErr = err;
    console.error(`[cron/pre-close] drop failed (${dateKey}):`, errText(err));
  }

  if (refreshErr || dropErr) {
    await reportPreCloseFailure(admin, dateKey, refreshErr, dropErr);
  }

  if (dropErr) {
    return NextResponse.json(
      { ok: false, date: dateKey, error: errText(dropErr) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    date: dateKey,
    analyses,
    finalized: alreadyFinal,
    provider: getProvider().name,
    // Present only when the drop survived a failed refresh — the theses were
    // scored off already-stored rows rather than a fresh fetch.
    ...(refreshErr ? { refreshError: errText(refreshErr) } : {}),
  });
}
