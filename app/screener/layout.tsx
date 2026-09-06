import { HydrationBoundary } from "@tanstack/react-query";
import { dehydratedGainers } from "@/lib/gainersSeed";

// Seeds the ["gainers"] cache so the board arrives WITH the document instead of
// after a client round-trip. Read-only, and deliberately stale so the client
// still confirms — see lib/gainersSeed.ts.
//
// It sits in the layout rather than the page because an awaiting page suspends
// into loading.tsx's boundary. That placement does NOT make the board visible
// to crawlers, though — measured, and worth writing down so nobody re-litigates
// it:
//
//   with app/screener/loading.tsx     board hidden in a <div hidden>, prefetch 67,781 B
//   without it                        board in the visible HTML, prefetch 187 B
//
// Those are one mechanism, not two. The prefetchable shell for a dynamic route
// IS the loading fallback, so a route cannot both have a shell to prefetch and
// render its dynamic content inline. loading.tsx stays because it fixes a real
// bug (ccaf751: ~5s dead taps on mobile, because Next skips prefetch entirely
// for a dynamic route with no fallback), and /screener is not a page that can
// win a search ranking anyway — "top gainers today" belongs to Yahoo Finance
// and Barchart. The crawlable surface is "/" (no loading.tsx, top five rendered
// visibly), /stock/* and /learn/*.
//
// What this seed still buys with loading.tsx in place: no first-paint fetch,
// and Googlebot — which does execute JS — reads the full board.
export default async function ScreenerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HydrationBoundary state={await dehydratedGainers()}>
      {children}
    </HydrationBoundary>
  );
}
