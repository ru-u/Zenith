import type { Metadata } from "next";
import { HydrationBoundary } from "@tanstack/react-query";
import { getViewer } from "@/lib/viewer";
import { dehydratedGainers } from "@/lib/gainersSeed";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqPageNode } from "@/lib/schema";
import { LandingHero } from "@/components/landing/LandingHero";
import { TopFive } from "@/components/landing/TopFive";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProSection } from "@/components/landing/ProSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQ, QA } from "@/components/landing/FAQ";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Zenith · Short the spike" },
  description:
    "Zenith ranks the day's biggest US market gainers and drops a quant-built short thesis on the top five at 3:30 ET. Built for DECA Stock Market Game competitors.",
  alternates: { canonical: "/" },
};

// The marketing landing. The screener (the tool itself) lives at /screener and
// stays public — this page's job is to explain the daily loop and funnel
// visitors into signup and Pro. Auth is read once here so every CTA renders
// correctly on first paint (no client-side subscription flash).
export default async function LandingPage() {
  // <Header> in the root layout needs the same two facts; getViewer() is
  // request-memoized so this resolves them once between the two.
  // <TopFive> renders live rows; without a seed they were skeletons in the HTML,
  // so the landing named no tickers to any crawler that doesn't run JS.
  // Read-only and deliberately stale — see lib/gainersSeed.ts.
  const [{ user, isPro }, gainersState] = await Promise.all([
    getViewer(),
    dehydratedGainers(),
  ]);
  const isLoggedIn = !!user;

  return (
    <HydrationBoundary state={gainersState}>
      <div className="flex flex-1 flex-col">
        {/* Same array <FAQ> renders — the markup and the visible text cannot
            drift, which is Google's condition for honouring FAQPage. */}
        <JsonLd data={faqPageNode(QA)} />
        <main className="flex-1">
          <LandingHero isLoggedIn={isLoggedIn} isPro={isPro} />
          <TopFive isPro={isPro} />
          <HowItWorks />
          <ProSection isLoggedIn={isLoggedIn} />
          <PricingSection isLoggedIn={isLoggedIn} isPro={isPro} />
          <FAQ />
        </main>
        <LandingFooter />
      </div>
    </HydrationBoundary>
  );
}
