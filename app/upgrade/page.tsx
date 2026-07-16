import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CheckoutButton } from "@/components/CheckoutButton";
import { ZenithMark } from "@/components/layout/Logo";
import { AmbientChevrons } from "@/components/landing/AmbientChevrons";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const PRO_FEATURES = [
  "Quant + AI short thesis on the top movers: risk level, catalysts, and base-rate odds",
  "The 3:30 drop email: top movers + thesis in your inbox before the close",
  "Unlimited history (free is capped at 5 trading days)",
  "Per-ticker streak history",
  "Short watchlist & email alerts",
];

export default async function UpgradePage() {
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

  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      {/* The landing's ascent motif, echoed behind the offer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-40 inset-y-0 opacity-60 dark:opacity-90"
      >
        <AmbientChevrons variant="echo" unique="upgrade-bg" />
      </div>
      <div className="glass-strong relative rounded-2xl p-8 shadow-[0_0_80px_-30px] shadow-brand/30">
        <p className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.24em] text-brand">
          <ZenithMark className="h-4 w-4" unique="upgrade" />
          Zenith Pro
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          $4.99<span className="text-base text-muted-foreground">/mo</span>
        </h1>
        <ul className="mt-6 flex flex-col gap-3">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>

        {isPro ? (
          <p className="mt-7 rounded-lg border border-brand/20 bg-brand/10 px-4 py-2.5 text-center text-sm font-semibold">
            <span className="bg-linear-to-r from-foreground to-brand bg-clip-text text-transparent">
              You&apos;re on Pro — thanks!
            </span>
          </p>
        ) : user ? (
          <CheckoutButton />
        ) : (
          <Link
            href="/auth/signup?next=/upgrade"
            className="mt-7 block rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02]"
          >
            Create an account to upgrade
          </Link>
        )}
      </div>
    </main>
  );
}
