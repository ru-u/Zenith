import { GainersHero } from "@/components/gainers/GainersHero";
import { TradeWindowBanner } from "@/components/gainers/TradeWindowBanner";
import { FilterBar } from "@/components/gainers/FilterBar";
import { GainersTable } from "@/components/gainers/GainersTable";
import { AIAnalysisCard } from "@/components/ai/AIAnalysisCard";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
      <GainersHero />
      <TradeWindowBanner />
      <AIAnalysisCard />
      <section className="flex flex-col gap-3">
        <FilterBar />
        <GainersTable limit={50} />
      </section>
    </main>
  );
}
