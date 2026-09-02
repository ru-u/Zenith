import type { Metadata } from "next";
import { getViewer } from "@/lib/viewer";
import { GainersHydration } from "@/lib/prefetchGainers";
import { Suspense } from "react";
import { LandingHero } from "@/components/landing/LandingHero";
import { TopFive } from "@/components/landing/TopFive";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProSection } from "@/components/landing/ProSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQ } from "@/components/landing/FAQ";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Zenith · Short the spike" },
  description:
    "Zenith ranks the day's biggest US market gainers and drops a quant-built short thesis on the top five at 3:30 ET. Built for DECA Stock Market Game competitors.",
};

// The marketing landing. The screener (the tool itself) lives at /screener and
// stays public — this page's job is to explain the daily loop and funnel
// visitors into signup and Pro. Auth is read once here so every CTA renders
// correctly on first paint (no client-side subscription flash).
export default async function LandingPage() {
  // <Header> in the root layout needs the same two facts; getViewer() is
  // request-memoized so this resolves them once between the two.
  const { user, isPro } = await getViewer();
  const isLoggedIn = !!user;

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        <LandingHero isLoggedIn={isLoggedIn} isPro={isPro} />
        {/* The funnel panel showed skeletons until hydration finished; this
            paints it with the HTML. Suspended so the DB read never delays the
            hero above it — see the note in app/screener/page.tsx. TopFive
            renders its own skeletons with no data, so it doubles as the
            fallback shape; the fallback here is a plain reserved box to avoid
            mounting the client component twice. */}
        <Suspense
          fallback={<div className="min-h-140" aria-busy />}
        >
          <GainersHydration>
            <TopFive isPro={isPro} />
          </GainersHydration>
        </Suspense>
        <HowItWorks />
        <ProSection isLoggedIn={isLoggedIn} />
        <PricingSection isLoggedIn={isLoggedIn} isPro={isPro} />
        <FAQ />
      </main>
      <LandingFooter />
    </div>
  );
}
