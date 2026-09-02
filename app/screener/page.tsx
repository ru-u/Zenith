import type { Metadata } from "next";
import { GainersHero } from "@/components/gainers/GainersHero";
import { TradeWindowBanner } from "@/components/gainers/TradeWindowBanner";
import { FilterBar } from "@/components/gainers/FilterBar";
import { GainersTable } from "@/components/gainers/GainersTable";
import { AIAnalysisCard } from "@/components/ai/AIAnalysisCard";
import { SignupPromptDialog } from "@/components/gainers/SignupPromptDialog";
import { GainersHydration } from "@/lib/prefetchGainers";
import { ScreenerSkeleton } from "@/components/gainers/ScreenerSkeleton";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Today's Top Short Candidates",
  description:
    "The day's biggest stock-market gainers, ranked. Spot the top movers and short the runners.",
};

export default function ScreenerPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
      {/* Hero and table both read the ["gainers"] query, so one boundary seeds
          the whole page from the database. See lib/prefetchGainers.tsx.
 
          The Suspense wrapper is what keeps that read OFF the critical path:
          the prefetch is several sequential Supabase round trips, and awaiting
          it before the first byte made tapping through to this page feel dead
          (~700ms of nothing, measured locally). Now the skeleton paints
          immediately and the filled-in board streams in behind it — still
          without waiting for any client JS. */}
      <Suspense fallback={<ScreenerSkeleton />}>
      <GainersHydration>
        <GainersHero />
        <TradeWindowBanner />
        <AIAnalysisCard />
        <section className="flex flex-col gap-3">
          <FilterBar />
          <GainersTable limit={50} />
        </section>
      </GainersHydration>
      </Suspense>
      {/* No repeat below the table: <AppFooter> lands immediately after it and
          carries the same two lines. */}
      {/* One shared, dismissible prompt for guests who click a favorite star. */}
      <SignupPromptDialog />
    </main>
  );
}
