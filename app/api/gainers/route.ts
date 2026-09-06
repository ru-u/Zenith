import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, ProviderError } from "@/lib/marketdata";
import { runEodProcessing, runPreCloseProcessing } from "@/lib/eod";
import { maybeAlert } from "@/lib/alerts";
import {
  FRESHNESS_MINUTES,
  getCachedGainers,
  latestScrapedAt,
  persistGainers,
  serveStoredGainers,
} from "@/lib/gainers";
import {
  getTodayET,
  getMarketSession,
  isDataStale,
  minutesSinceCloseET,
  minutesSinceOpenET,
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
// Wait this long after the 4:00 PM ET close before freezing the official close.
// Covers the NYSE/Nasdaq closing auction AND the provider's 15-minute feed
// delay (`update_mode: "delayed_streaming_900"`) — at 4:05 the scanner is still
// serving ~3:50 prices, so finalizing then stores a pre-close snapshot as the
// official close. Keep in sync with SETTLE_MIN in instrumentation.ts.
const CLOSE_SETTLE_MINUTES = 20;
// Minutes before the close to generate AI theses (the actionable "drop"). DECA
// orders placed before the close fill at today's close, so this leaves a window
// to read the theses and place orders.
const PRECLOSE_WINDOW_MINUTES = 30;

// Extra slack on top of the provider's feed delay before the first probe of a
// new day. The delay says today's bar can't exist upstream before 9:45; two
// minutes covers the first prints actually landing. Nothing correctness-
// critical rides on this number — persistGainers' session gate is what decides
// whether a batch is today's. This only stops us spending calls on the
// (undocumented, ToS-risky) scanner on a question we already know the answer to.
const WARMUP_BUFFER_MINUTES = 2;

// While no rows exist for today, `isDataStale(null)` is trivially true, so the
// normal 10-minute freshness gate can't throttle anything — every page load in
// the warm-up window would hit the provider, and a DECA classroom arriving at
// the open is exactly when that happens. Probe at most this often instead.
const WARMUP_PROBE_INTERVAL_MS = 2 * 60_000;

// Past this much of the session with the provider still serving an earlier day,
// the warm-up explanation no longer holds and someone should look. Deduped to
// one email per day by maybeAlert's (date, type) key.
const FEED_STALE_ALERT_MINUTES = 45;

// In-memory and therefore PER-PROCESS — correct only because Railway runs a
// single replica, the same constraint lib/ratelimit.ts and the node-cron
// scheduler in instrumentation.ts already depend on. Worst case if that ever
// changes: N replicas probe N times, which is a cost, not a correctness bug.
let lastWarmupProbe = 0;

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

  let rows = await getCachedGainers(admin, dateKey);
  let asOf = latestScrapedAt(rows);

  const alreadyFinal = rows.some((r) => r.is_final);

  // Intraday refresh — during the REGULAR session (9:30 AM–4:00 PM ET) we
  // refresh stale data on read.
  const isOpen = getMarketSession() === "open";

  // Warm-up: the market is open but nothing is stored for today yet. The
  // provider's feed is delayed, so for the first ~17 minutes it is still
  // serving YESTERDAY's bar and there is no point asking. After the floor we
  // probe on a slow timer until persistGainers' session gate accepts a batch —
  // that gate, not this clock, is what ends the window.
  const sinceOpen = minutesSinceOpenET();
  const warmupFloorMinutes =
    getProvider().feedDelaySeconds / 60 + WARMUP_BUFFER_MINUTES;
  const warming = isOpen && !alreadyFinal && rows.length === 0;
  const beforeWarmupFloor =
    warming && (sinceOpen == null || sinceOpen < warmupFloorMinutes);

  const shouldFetch =
    isOpen &&
    !alreadyFinal &&
    !beforeWarmupFloor &&
    (warming
      ? Date.now() - lastWarmupProbe > WARMUP_PROBE_INTERVAL_MS
      : isDataStale(asOf, FRESHNESS_MINUTES));

  // Capture the official close on read — once the auction has settled AND the
  // provider's delayed feed has caught up (see CLOSE_SETTLE_MINUTES), the first
  // page load freezes the real close instead of waiting for the EOD cron. Until
  // then the board stays non-final and reports DELAYED. After this, `alreadyFinal`
  // short-circuits all further scrapes; the cron later re-confirms + runs
  // streaks/AI. DECA orders execute at the close, so this is the number to lock.
  const sinceClose = minutesSinceCloseET();
  const shouldFinalize =
    !alreadyFinal &&
    sinceClose != null &&
    sinceClose >= CLOSE_SETTLE_MINUTES;

  if (shouldFetch || shouldFinalize) {
    if (warming) lastWarmupProbe = Date.now();
    try {
      const gainers = await getProvider().getTopGainers(FETCH_LIMIT);
      const result = await persistGainers(admin, gainers, dateKey, shouldFinalize);

      if (result.reason === "stale-session") {
        // The provider is still on an earlier session. Nothing was written, so
        // today stays empty and serveStoredGainers falls back to the last
        // finalized day with warmingUp set. Silent through the normal window —
        // this is the expected state at 9:35 every single morning.
        if (sinceOpen != null && sinceOpen > FEED_STALE_ALERT_MINUTES) {
          await maybeAlert(admin, {
            date: dateKey,
            type: "feed_not_rolled",
            subject: `Zenith: market-data feed still on ${result.sessionDate} at ${sinceOpen} min into the session`,
            body:
              `${getProvider().name} is serving session ${result.sessionDate}, not ${dateKey}, ` +
              `${sinceOpen} minutes after the open. The session gate in persistGainers is ` +
              `refusing to file those figures under today, so the screener is showing the last ` +
              `finalized day and labelling it "Scanning". Nothing is being corrupted — but no ` +
              `fresh data will land until the provider rolls over.`,
          });
        }
      } else if (result.persisted) {
        rows = await getCachedGainers(admin, dateKey);
        asOf = latestScrapedAt(rows);

        if (result.sessionDate == null) {
          // Fail-open path: we wrote the batch without being able to check
          // which session it describes. Working as designed, but the guard is
          // blind until the column comes back.
          await maybeAlert(admin, {
            date: dateKey,
            type: "feed_session_unknown",
            subject: `Zenith: scanner returned no session timestamp (${dateKey})`,
            body:
              `No row in the ${getProvider().name} batch carried a usable \`time\` value, so the ` +
              `session gate in persistGainers could not verify the data is today's and wrote it ` +
              `anyway (fail-open by design). Check whether the scanner's column contract changed ` +
              `— lib/marketdata/tradingview.ts. Until it's fixed, the 9:30–9:47 warm-up hole is ` +
              `open again and yesterday's board can be filed as today's.`,
          });
        }
      }

      // The moment we freeze the close, kick off streaks + AI theses in the
      // background (after the response flushes — never blocks the page). The
      // ~4:20 PM EOD cron is a backstop; both steps are idempotent.
      if (shouldFinalize && result.persisted && rows.length > 0) {
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

  // Day selection, cleaning and response shape are shared with the server-side
  // prefetch on "/" and /screener — see serveStoredGainers. Everything above
  // this point (provider refresh, close capture, the pre-close drop) is the
  // half that must only ever run on a request, never from a render.
  return NextResponse.json(await serveStoredGainers(admin, dateKey, { rows, asOf }), {
    headers: { "cache-control": "no-store" },
  });
}
