import Link from "next/link";
import { AmbientChevrons } from "./AmbientChevrons";
import { DropCountdown } from "./DropCountdown";
import { PRO_PRICE_MONTHLY } from "@/lib/pricing";

// The hero is a brand statement, Raycast-style: one centered claim over the
// Ascent field (the logo adrift at architectural scale). No live data here —
// the real top five moved to <TopFive> just below, so this whole component
// stays a server render and the LCP is plain text. The landing is pinned
// dark (see app/providers.tsx forcedTheme).
export function LandingHero({
  isLoggedIn,
  isPro,
}: {
  isLoggedIn: boolean;
  isPro: boolean;
}) {
  return (
    <section className="relative flex min-h-[76svh] flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16 text-center">
      <AmbientChevrons variant="hero" unique="hero" />

      <div className="animate-hero-rise relative z-10 flex max-w-3xl flex-col items-center gap-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-brand">
          Built for the DECA Stock Market Game
        </p>
        <h1 className="bg-linear-to-b from-foreground via-foreground to-brand bg-clip-text text-6xl font-semibold leading-[1.02] tracking-[-0.04em] text-balance text-transparent sm:text-7xl">
          Short the spike.
        </h1>
        {/* Soft dark halo lifts the copy off the trace lines behind it. */}
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground [text-shadow:0_1px_3px_oklch(0.06_0.015_220/0.9),0_0_18px_oklch(0.06_0.015_220/0.7)] sm:text-lg">
          Every day a handful of stocks spike double digits. Most give it
          back. Zenith ranks the day&apos;s biggest gainers, tracks their
          streaks, and drops a quant short thesis on the top five at 3:30 ET,
          while your order still fills at today&apos;s close.
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {/* Free/guest: quiet translucent pill so the paid CTA beside it
              carries the brand gradient on its own. Pro: the upgrade CTA is
              gone, so the screener link inherits the gradient as the page's
              primary action. */}
          <Link
            href="/screener"
            className={
              isPro
                ? "rounded-full bg-brand btn-brand px-6 py-3 text-sm font-semibold text-brand-foreground shadow-[0_0_44px_-10px] shadow-brand/80 transition-[transform,box-shadow] hover:scale-[1.03] hover:shadow-brand"
                : "rounded-full bg-white/5 px-6 py-3 text-sm font-semibold text-foreground ring-1 ring-white/10 transition-colors hover:text-brand hover:ring-brand/30"
            }
          >
            {isLoggedIn ? "Launch screener" : "See today's movers"}
          </Link>
          {!isPro && (
            <Link
              href={isLoggedIn ? "/upgrade" : "/auth/signup?next=/upgrade"}
              className="rounded-full bg-brand btn-brand px-6 py-3 text-sm font-semibold text-brand-foreground shadow-[0_0_44px_-10px] shadow-brand/80 transition-[transform,box-shadow] hover:scale-[1.03] hover:shadow-brand"
            >
              Get Pro · {PRO_PRICE_MONTHLY}
            </Link>
          )}
        </div>

        <DropCountdown className="mt-3" />
      </div>

      {/* No painted bottom fade here: the page sits on the fixed GradientMesh,
          and fading to the flat --background over it left a visible tonal seam
          at the section edge. The field dissolves via its own mask instead
          (see AmbientChevrons), so hero → TopFive is one continuous surface. */}
    </section>
  );
}
