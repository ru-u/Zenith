"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { PRO_PRICE_MONTHLY } from "@/lib/pricing";

/**
 * Renders real Pro content blurred behind an upgrade CTA for free users
 * (visible value drives conversion — blurred, never hidden). Pro users see it.
 */
export function ProGate({ children }: { children: React.ReactNode }) {
  const { isPro, loading } = useSubscription();

  if (loading) {
    return <div className="skeleton-sweep h-40 rounded-xl ring-1 ring-foreground/10" />;
  }

  if (isPro) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="pointer-events-none select-none blur-sm" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/50 p-6 text-center backdrop-blur-[2px]">
        <span className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand">
          <Lock className="h-4 w-4" />
        </span>
        <p className="text-sm font-medium">The short thesis is a Pro feature</p>
        <Link
          href="/upgrade"
          className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
        >
          Upgrade to Pro · {PRO_PRICE_MONTHLY}
        </Link>
      </div>
    </div>
  );
}
