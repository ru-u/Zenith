import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { runEodProcessing, runPreCloseProcessing } from "@/lib/eod";
import { maybeAlert } from "@/lib/alerts";
import {
  dropFrozenRepeats,
  dropSplitArtifacts,
  getCachedGainers,
  getGainersDateBefore,
  getLatestGainersDate,
  latestScrapedAt,
  persistGainers,
} from "@/lib/gainers";
import {
  getTodayET,
  getMarketStatus,
  getMarketSession,
  isDataStale,
  minutesSinceCloseET,
  secondsUntilCloseET,
} from "@/lib/market-calendar";
import { checkLimit } from "@/lib/ratelimit";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Normal reads finish in <1s; the ceiling is for the rare close-capture request
// that runs streaks + AI theses in the background via after().
export const maxDuration = 60;

const FETCH_LIMIT = 100;
const FRESHNESS_MINUTES = 10;
// Wait this long after the 4:00 PM ET close before freezing the official close,
// so the NYSE/Nasdaq closing auction has fully settled.
const CLOSE_SETTLE_MINUTES = 5;
// Minutes before the close to generate AI theses (the actionable "drop"). DECA
// orders placed before the close fill at today's close, so this leaves a window
// to read the theses and place orders.
const PRECLOSE_WINDOW_MINUTES = 30;

// Deliberately loose. This is the only unauthenticated endpoint and it backs
// the home page, whose audience is high-school DECA teams — a whole classroom
// commonly shares one school NAT address, so a tight per-IP limit would lock
// out real users long before it inconvenienced anyone. 240/min still caps the
// `while true; do curl` case at a rate the DB and the 10-minute provider
// freshness guard both absorb without noticing.
const RATE_LIMIT = 240;
const RATE_WINDOW_SECONDS = 60;

export async function GET(req: Request) {
  const limited = checkLimit(req, {
    route: "gainers",
    limit: RATE_LIMIT,
    windowSeconds: RATE_WINDOW_SECONDS,
  });
  if (limited) {
    logSecurityEvent("ratelimit.exceeded", {
      ip: clientIp(req),
      route: "GET /api/gainers",
    });
    return limited;
  }

  const admin = createAdminClient();
  const dateKey = getTodayET();

  let servedDate = dateKey;
  let rows = await getCachedGainers(admin, dateKey);
  let asOf = latestScrapedAt(rows);

  const alreadyFinal = rows.some((r) => r.is_final);

  // Intraday refresh — during the REGULAR session (9:30 AM–4:00 PM ET) we
  // refresh stale data on read.
  const isOpen = getMarketSession() === "open";
  const shouldFetch =
    isOpen &&
    !alreadyFinal &&
    (rows.length === 0 || isDataStale(asOf, FRESHNESS_MINUTES));

  // Capture the official close on read — once the closing auction has settled
  // (a few minutes after 4:00 PM ET), the first page load freezes the real
  // close instead of waiting for the 5:05 PM EOD cron. After this, `alreadyFinal`
  // short-circuits all further scrapes; the cron later re-confirms + runs
  // streaks/AI. DECA orders execute at the close, so this is the number to lock.
  const sinceClose = minutesSinceCloseET();
  const shouldFinalize =
    !alreadyFinal &&
    sinceClose != null &&
    sinceClose >= CLOSE_SETTLE_MINUTES;

  if (shouldFetch || shouldFinalize) {
    try {
      const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
      await persistGainers(admin, gainers, dateKey, shouldFinalize);
      rows = await getCachedGainers(admin, dateKey);
      asOf = latestScrapedAt(rows);

      // The moment we freeze the close, kick off streaks + AI theses in the
      // background (after the response flushes — never blocks the page). The
      // 5:05 PM EOD cron is a backstop; both steps are idempotent.
      if (shouldFinalize && rows.length > 0) {
        after(async () => {
          try {
            await runEodProcessing(admin, dateKey);
          } catch (e) {
            console.error("[/api/gainers] eod processing:", (e as Error)?.message);
          }
        });
      }
    } catch (err) {
      // Provider failed (TradingView block, timeout, etc.) — serve last cache,
      // flagged stale. Never 500.
      if (!(err instanceof ProviderError)) throw err;
      console.error("[/api/gainers] provider error:", err.message);
      // A fetch we expected to succeed (open session or close-capture) failed
      // after retries. Email once per day — the unique (date,type) dedup means
      // this won't flood across page loads or double up with the cron alert.
      await maybeAlert(admin, {
        date: dateKey,
        type: "provider_failed",
        subject: `Zenith: market-data provider failed for ${dateKey}`,
        body: `On-read fetch from ${getProvider().name} failed after retries: ${err.message}. Serving stale cache; the screener may be showing outdated data.`,
      });
    }
  }

  // Pre-close drop: ~30 min before the close, generate AI theses for the current
  // top-N off the live intraday data and email opted-in users, so students can
  // act while orders still fill at today's close. Fires once/day — the theses
  // count guard skips it after the first run; the in-process scheduler is the
  // zero-traffic backstop. Runs in after() so it never blocks the page.
  const sUntilClose = secondsUntilCloseET();
  const inPreCloseWindow =
    sUntilClose != null && sUntilClose <= PRECLOSE_WINDOW_MINUTES * 60;
  if (!alreadyFinal && inPreCloseWindow && rows.length > 0) {
    const { count } = await admin
      .from("ai_analyses")
      .select("ticker", { count: "exact", head: true })
      .eq("date", dateKey);
    if ((count ?? 0) === 0) {
      after(async () => {
        try {
          await runPreCloseProcessing(admin, dateKey);
        } catch (e) {
          console.error("[/api/gainers] pre-close processing:", (e as Error)?.message);
        }
      });
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

  // Drop reverse-split artifacts stored before the ingestion guard existed,
  // then frozen repeats (e.g. a halted stock reporting identical values daily)
  // vs the prior trading day.
  rows = dropSplitArtifacts(rows);
  const prevDate = await getGainersDateBefore(admin, servedDate);
  if (prevDate) {
    rows = dropFrozenRepeats(rows, await getCachedGainers(admin, prevDate));
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
