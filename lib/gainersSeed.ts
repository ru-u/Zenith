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
// Memoized per request: the landing renders <TopFive> and this seed in the same
// pass, same reasoning as getViewer().
export const dehydratedGainers = cache(
  async (): Promise<DehydratedState | null> => {
    try {
      const payload = await serveStoredGainers(createAdminClient(), getTodayET());
      const queryClient = new QueryClient();
      queryClient.setQueryData(["gainers"], payload, { updatedAt: 0 });
      return dehydrate(queryClient);
    } catch (e) {
      // Fail open: a DB blip degrades the page to today's behaviour (skeleton
      // then client fetch), it never blanks it.
      console.error("[gainersSeed]", (e as Error)?.message);
      return null;
    }
  },
);
