import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CheckoutButton } from "@/components/CheckoutButton";
import { ZenithMark } from "@/components/layout/Logo";
import { AmbientChevrons } from "@/components/landing/AmbientChevrons";
import { TIER_FEATURES } from "@/lib/pricing";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

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
    <main className="relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      {/* The landing's ascent motif, full-bleed behind the offer (like the
          hero) rather than boxed to the card — otherwise the chevron arms hit
          the container's side wall and stop mid-page instead of sweeping to
          the corners. The field is scaled up so the arms reach the bottom
          corners, and its masks fade only at the top (under the header); the
          rest stays lit so nothing dims the arms before the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-90"
      >
        <div className="absolute inset-0 scale-[1.35]">
          <AmbientChevrons
            variant="echo"
            unique="upgrade-bg"
            maskClassName="mask-[radial-gradient(200%_200%_at_50%_50%,black_94%,transparent_100%)]"
            innerMaskClassName="mask-[linear-gradient(to_bottom,transparent_0%,black_9%,black_100%)]"
          />
        </div>
      </div>
      <div className="glass-strong relative z-10 w-full max-w-md rounded-2xl p-8 shadow-[0_0_80px_-30px] shadow-brand/30">
        <p className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.24em] text-brand">
          <ZenithMark className="h-4 w-4" unique="upgrade" />
          Zenith Pro
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          $4.99<span className="text-base text-muted-foreground">/mo</span>
        </h1>
        <ul className="mt-6 flex flex-col gap-3">
          {TIER_FEATURES.pro.map((f) => (
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
