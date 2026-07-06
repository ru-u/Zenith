"use client";

import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";

/**
 * The Pro card's action, switched on server-read auth state (no client
 * subscription fetch — no CTA flash). Reuses the exact upgrade-page flows:
 * signed-out goes through signup with ?next=/upgrade; signed-in free goes
 * straight into Stripe checkout via CheckoutButton.
 */
export function PricingCTA({
  isLoggedIn,
  isPro,
}: {
  isLoggedIn: boolean;
  isPro: boolean;
}) {
  if (isPro) {
    return (
      <p className="mt-7 rounded-full border border-brand/20 bg-brand/10 px-4 py-2.5 text-center text-sm font-semibold">
        <span className="bg-linear-to-r from-foreground to-brand bg-clip-text text-transparent">
          You&apos;re on Pro — thanks!
        </span>
      </p>
    );
  }
  if (isLoggedIn) {
    return (
      <CheckoutButton className="rounded-full bg-foreground text-background shadow-[0_0_44px_-10px] shadow-brand/80 hover:shadow-brand" />
    );
  }
  return (
    <Link
      href="/auth/signup?next=/upgrade"
      className="mt-7 block rounded-full bg-foreground px-4 py-2.5 text-center text-sm font-semibold text-background shadow-[0_0_44px_-10px] shadow-brand/80 transition-[transform,box-shadow] hover:scale-[1.02] hover:shadow-brand"
    >
      Get Pro · $4.99/mo
    </Link>
  );
}
