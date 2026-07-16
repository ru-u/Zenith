import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { PricingCTA } from "./PricingCTA";

// Honest tier lines: the screener itself needs no account; an account adds
// charts + streaks + recent history; Pro adds the thesis, the 3:30 email, and
// depth.
const TIERS = {
  browse: [
    "Today's full screener: the day's biggest gainers, ranked",
    "Filters by price, market cap, and ticker search",
    "Live market status & close countdown",
  ],
  free: [
    "Everything in Browse",
    "Simple price charts, built for beginners",
    "Consecutive-day streak badges",
    "The last 5 trading days of history",
  ],
  pro: [
    "Quant-AI short thesis on the top 5, every trading day",
    "The 3:30 drop email: top movers + thesis in your inbox before the close",
    "Unlimited history + per-ticker streak history",
    "Short watchlist & alerts",
  ],
} as const;

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-5 flex flex-col gap-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span className="text-muted-foreground">{f}</span>
        </li>
      ))}
    </ul>
  );
}

export function PricingSection({
  isLoggedIn,
  isPro,
}: {
  isLoggedIn: boolean;
  isPro: boolean;
}) {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20">
      <Reveal>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          The screener is free. The edge is $4.99.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Anyone can see the day&apos;s biggest gainers. Pro breaks down each
          of the top 5 as a short candidate: the catalyst behind the spike, and
          how similar spikes have played out before. In your inbox by 3:30,
          before the close.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col rounded-2xl bg-white/3 p-6 ring-1 ring-white/6 transition-colors hover:bg-white/5">
            <h3 className="font-semibold tracking-tight">Browse</h3>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              $0
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                · no account
              </span>
            </p>
            <FeatureList items={TIERS.browse} />
            <div className="flex-1" />
            <Link
              href="/screener"
              className="mt-7 block rounded-full bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-foreground ring-1 ring-white/10 transition-colors hover:text-brand hover:ring-brand/30"
            >
              Open the screener
            </Link>
          </div>

          <div className="flex flex-col rounded-2xl bg-white/3 p-6 ring-1 ring-white/6 transition-colors hover:bg-white/5">
            <h3 className="font-semibold tracking-tight">Free account</h3>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              $0
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                · forever
              </span>
            </p>
            <FeatureList items={TIERS.free} />
            <div className="flex-1" />
            {isLoggedIn ? (
              <p className="mt-7 rounded-full px-4 py-2.5 text-center text-sm text-muted-foreground ring-1 ring-white/10">
                You&apos;re signed in
              </p>
            ) : (
              <Link
                href="/auth/signup"
                className="mt-7 block rounded-full bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-foreground ring-1 ring-white/10 transition-colors hover:text-brand hover:ring-brand/30"
              >
                Create free account
              </Link>
            )}
          </div>

          {/* Pro carries the page's glow — the one card allowed to be loud. */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl bg-white/4 p-6 shadow-[0_0_90px_-30px] shadow-brand/40 ring-1 ring-brand/35">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
            />
            <h3 className="font-semibold tracking-tight text-brand">Pro</h3>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              $4.99
              <span className="text-sm font-normal text-muted-foreground">
                /mo
              </span>
            </p>
            <FeatureList items={TIERS.pro} />
            <div className="flex-1" />
            <PricingCTA isLoggedIn={isLoggedIn} isPro={isPro} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
