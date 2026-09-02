import type { Metadata } from "next";
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
};

export default function ScreenerPage() {
  return (
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
  );
}
