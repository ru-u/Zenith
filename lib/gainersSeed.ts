import { cache } from "react";
import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { createAdminClient } from "@/lib/supabase/admin";
import { serveStoredGainers } from "@/lib/gainers";
import { getTodayET } from "@/lib/market-calendar";

// Server-side seed for the ["gainers"] query, so "/" and /screener ship the real
// board in their HTML instead of skeletons.
//
// WHY THIS EXISTS: client components DO server-render, so the headings, the FAQ
// and the page chrome were always in the document — but TanStack Query has no
// data during SSR, so every ticker, price and company name was missing. Googlebot
// renders JS eventually and saw them; GPTBot, ClaudeBot, PerplexityBot and
// Bingbot largely do not, so to an answer engine the product page was blank.
// (Verified against production 2026-09-06: /screener returned 222 skeleton
// markers and zero NASDAQ/NYSE strings.)
//
// READ PATH ONLY. `serveStoredGainers` is the side-effect-free half of
// GET /api/gainers and is the ONLY thing lifted out of it — the provider
// refresh, the official-close capture and the pre-close drop stay on the request
// path. A render that fires provider calls is a bug this codebase has already
// shipped once; see the docblock on serveStoredGainers.
//
// THE SEED IS DELIBERATELY STALE ON ARRIVAL (`updatedAt: 0`). With the query's
// normal 10-minute staleTime the client would hydrate and NOT fetch, which would
// silently disable the write path: there is no morning cron, and "the first
// fetch of a day is whoever loads the page first after 9:30" (CLAUDE.md). Every
// intraday refresh, the close capture and the warm-up probe hang off that first
// client request. Marking the seed stale keeps the request count and the write
// path exactly as they are today — the seed buys crawlable HTML and a
// skeleton-free first paint, and buys nothing else on purpose.
//
// CACHED FOR 60s ACROSS REQUESTS, because the read is not cheap and it now sits
// in front of the HTML. Measured on production the day this shipped:
//
//   /engine, /privacy, /learn   (no board read)   ~0.10s TTFB
//   /, /screener                (board read)      0.58-1.06s TTFB
//   /api/gainers                (same read alone) 0.65-1.14s
//
// The third line is the point: that cost was always there, it just used to land
// after page load instead of in front of it. serveStoredGainers makes 4-5
// SEQUENTIAL Supabase round trips and Railway->Supabase is ~150-250ms each.
// Time-to-content was still no worse than before, but TTFB is an LCP input and
// ~0.8s on the marketing front door is in Google's "needs improvement" band,
// which works against the reason this seed exists at all.
//
// 60s is safe precisely BECAUSE the seed is stale on arrival: the client refetches
// on mount regardless, so this window can never be what a user ends up looking at
// — it only decides how fresh the first paint is, and the board itself only moves
// every FRESHNESS_MINUTES (10). During the morning warm-up useGainers polls at 1
// min, so a warming seed self-corrects inside a second either way.
//
// PER-PROCESS, the same single-replica assumption as lib/ratelimit.ts, the
// warm-up probe in /api/gainers, and qualifyingTickers in lib/tickerPages.ts.
//
// Failures are deliberately NOT cached — caching a null would stretch a
// momentary DB blip into a full minute of degraded pages.
const SEED_TTL_MS = 60_000;
let seedCache: { at: number; state: DehydratedState } | null = null;

// cache() keeps this to a single resolution within one request too — the landing
// renders <TopFive> and this seed in the same pass, same reasoning as getViewer().
export const dehydratedGainers = cache(
  async (): Promise<DehydratedState | null> => {
    if (seedCache && Date.now() - seedCache.at < SEED_TTL_MS) {
      return seedCache.state;
    }
    try {
      const payload = await serveStoredGainers(createAdminClient(), getTodayET());
      const queryClient = new QueryClient();
      queryClient.setQueryData(["gainers"], payload, { updatedAt: 0 });
      const state = dehydrate(queryClient);
      seedCache = { at: Date.now(), state };
      return state;
    } catch (e) {
      // Fail open: a DB blip degrades the page to today's behaviour (skeleton
      // then client fetch), it never blanks it.
      console.error("[gainersSeed]", (e as Error)?.message);
      return null;
    }
  },
);
