import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LandingHero } from "@/components/landing/LandingHero";
import { TopFive } from "@/components/landing/TopFive";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProSection } from "@/components/landing/ProSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQ } from "@/components/landing/FAQ";
import { LandingFooter } from "@/components/landing/LandingFooter";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Zenith — Short the spike" },
  description:
    "Zenith ranks the day's biggest US market gainers and drops an AI short thesis at 3:30 ET — built for DECA Stock Market Game competitors.",
};

// The marketing landing. The screener (the tool itself) lives at /screener and
// stays public — this page's job is to explain the daily loop and funnel
// visitors into signup and Pro. Auth is read once here so every CTA renders
// correctly on first paint (no client-side subscription flash).
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isPro = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .maybeSingle<{ subscription_tier: SubscriptionTier }>();
    isPro = data?.subscription_tier === "pro";
  }
  const isLoggedIn = !!user;

  return (
    <div className="flex flex-1 flex-col">
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
  );
}
