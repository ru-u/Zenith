"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { CountUp } from "./CountUp";
import { StreakBadge } from "./StreakBadge";
import { FavoriteStar } from "./FavoriteStar";
import { ChartDialog } from "./ChartDialog";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { useGainers } from "@/hooks/useGainers";
import { useStreaks } from "@/hooks/useStreaks";
import { useTickerOpen } from "@/hooks/useTickerOpen";
import { formatPrice } from "@/lib/format";
import type { DailyGainer } from "@/lib/supabase/types";

// Hover halo: a brand-cyan border + outer bloom (the CTA-button glow
// treatment), with prominence ramping DOWN by rank — card #1 the strongest,
// #5 the faintest. The card interior stays untinted so the numbers keep their
// contrast; var(--brand) adapts per theme, so the ramp reads in both modes.
function heroHalo(index: number): React.CSSProperties {
  const ring = 65 - index * 7; // border: 65 → 37 across #1–#5
  const bloom = 75 - index * 10; // outer glow: 75 → 35
  return {
    borderColor: `color-mix(in oklab, var(--brand) ${ring}%, transparent)`,
    boxShadow: `0 0 48px -10px color-mix(in oklab, var(--brand) ${bloom}%, transparent)`,
  };
}

function HeroCard({
  gainer,
  streak,
  index,
  onClick,
}: {
  gainer: DailyGainer;
  streak?: number;
  index: number;
  onClick: () => void;
}) {
  const change = gainer.change_percent ?? 0;
  // Big runners get no decimals + comma grouping so they fit inside the card.
  const decimals = Math.abs(change) >= 100 ? 0 : 2;

  return (
    // Staggered fade-up on mount. CSS (`.animate-card-rise`) rather than
    // framer-motion: this and <Reveal> were the library's only two uses, both
    // plain opacity/transform, and it cost ~40KB gzip on every screener load.
    <div
      className="group animate-card-rise relative h-full cursor-pointer"
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={onClick}
    >
      {/* Painted above the card (later positioned sibling) so the cyan ring
          replaces the glass border on hover instead of hiding under it. */}
      <div
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl border opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={heroHalo(index)}
        aria-hidden
      />
      <div className="glass-strong relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-base font-semibold tracking-tight">
            {gainer.ticker}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <StreakBadge count={streak} />
            <FavoriteStar ticker={gainer.ticker} revealOnHover />
          </div>
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {gainer.company_name ?? " "}
        </p>

        <div className="mt-auto flex min-w-0 items-baseline gap-1.5">
          <TrendingUp className="h-4 w-4 shrink-0 text-up" />
          <span className="min-w-0 text-2xl font-bold leading-none text-up tabular-nums">
            <CountUp value={change} prefix="+" suffix="%" decimals={decimals} />
          </span>
        </div>

        <p className="text-sm tabular-nums text-muted-foreground">
          {formatPrice(gainer.price)}
        </p>
      </div>
    </div>
  );
}

export function GainersHero() {
  const { data } = useGainers();
  const { data: streaks } = useStreaks();
  const top = (data?.gainers ?? []).slice(0, 5);
  const [selected, setSelected] = useState<DailyGainer | null>(null);
  const openTicker = useTickerOpen(setSelected);

  return (
    <>
    <ChartDialog
      gainer={selected}
      streak={selected ? streaks?.get(selected.ticker) : undefined}
      onClose={() => setSelected(null)}
    />
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="bg-linear-to-br from-foreground to-brand bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            Today&apos;s top short candidates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The day&apos;s biggest market gainers, ranked highest to lowest.
          </p>
        </div>
        {data && (
          <MarketStatusBadge
            asOf={data.asOf}
            date={data.date}
            isFinal={(data.gainers ?? []).some((g) => g.is_final)}
          />
        )}
      </div>

      {/* Single ranked row, #1 → #5 left to right. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {top.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass h-37.5 animate-pulse rounded-2xl" />
            ))
          : top.map((g, i) => (
              <HeroCard
                key={g.ticker}
                gainer={g}
                streak={streaks?.get(g.ticker)}
                index={i}
                onClick={() => openTicker(g)}
              />
            ))}
      </div>
    </section>
    </>
  );
}
