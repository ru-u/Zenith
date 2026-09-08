import type { Metadata } from "next";
import { HydrationBoundary } from "@tanstack/react-query";
import { dehydratedGainers } from "@/lib/gainersSeed";
import { dehydratedViewer } from "@/lib/viewerSeed";
import { GainersHero } from "@/components/gainers/GainersHero";
import { TradeWindowBanner } from "@/components/gainers/TradeWindowBanner";
import { FilterBar } from "@/components/gainers/FilterBar";
import { GainersTable } from "@/components/gainers/GainersTable";
import { AIAnalysisCard } from "@/components/ai/AIAnalysisCard";
import { SignupPromptDialog } from "@/components/gainers/SignupPromptDialog";

export const metadata: Metadata = {
  title: "Today's Top Short Candidates",
  description:
    "The day's biggest stock-market gainers, ranked. Spot the top movers and short the runners.",
  alternates: { canonical: "/screener" },
};

// The seed lives HERE, in the page, so that loading.tsx catches the suspension.
//
// It used to sit in app/screener/layout.tsx, deliberately, so that an awaiting
// page wouldn't suspend into loading.tsx and hide the board from crawlers. That
// reasoning defeated itself: Next nests loading.tsx *inside* layout.tsx, so an
// awaiting layout blocks its own skeleton — nothing at all could flush until
// serveStoredGainers' 3-5 sequential Supabase round trips came back (0.58-1.06s
// TTFB measured, vs ~0.10s for a page with no board read; see lib/gainersSeed.ts).
// And the same docblock that justified the placement already concluded /screener
// is not a crawlable surface: with loading.tsx present the board lands in a
// <div hidden> either way. So the placement bought nothing and cost the shell.
//
// Awaiting in the page instead means the skeleton, the stylesheet and the JS
// bundle all reach the phone at ~0.10s while this read streams in underneath —
// the DB work now overlaps the asset download instead of preceding it.
//
// NOT deleted outright, which was the other option: the seed still ships the
// board IN THE HTML. Without it the board would have to wait for the JS bundle
// to download and hydrate before useGainers could even issue its request, which
// is worse on exactly the phones this change is for.
//
// `updatedAt: 0` inside dehydratedGainers() is UNCHANGED and still load-bearing:
// the client must refetch on mount or the write path dies with it (there is no
// morning cron — the first fetch of a day is whoever loads the page first after
// 9:30, and the intraday refresh, the close capture and the warm-up probe all
// hang off that first client request).
//
// No force-dynamic: this read is uncached and the root layout reads cookies, so
// the route is dynamic regardless.
export default async function ScreenerPage() {
  // In parallel, though the viewer half is already resolved: getViewer() is
  // cache()d and <Header> called it on this request.
  const [gainers, viewer] = await Promise.all([
    dehydratedGainers(),
    dehydratedViewer(),
  ]);

  return (
    <HydrationBoundary state={gainers}>
      <HydrationBoundary state={viewer}>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
          <GainersHero />
          <TradeWindowBanner />
          <AIAnalysisCard />
          <section className="flex flex-col gap-3">
            <FilterBar />
            <GainersTable limit={50} />
          </section>
          {/* No repeat below the table: <AppFooter> lands immediately after it and
            carries the same two lines. */}
          {/* One shared, dismissible prompt for guests who click a favorite star. */}
          <SignupPromptDialog />
        </main>
      </HydrationBoundary>
    </HydrationBoundary>
  );
}
