import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { runEodProcessing } from "@/lib/eod";
import {
  dropFrozenRepeats,
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
} from "@/lib/market-calendar";

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

export async function GET() {
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

  // Drop frozen repeats (e.g. a halted stock reporting identical values daily)
  // vs the prior trading day.
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
