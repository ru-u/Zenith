"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { CountUp } from "./CountUp";
import { StreakBadge } from "./StreakBadge";
import { ChartDialog } from "./ChartDialog";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { useGainers } from "@/hooks/useGainers";
import { useStreaks } from "@/hooks/useStreaks";
import { formatPrice } from "@/lib/format";
import type { DailyGainer } from "@/lib/supabase/types";

// Hover-glow: the brand cyan, with prominence ramping DOWN by rank — card #1 is
// the strongest cyan glow, each card after it a step weaker, #5 the faintest.
// var(--brand) adapts per theme, so the ramp reads in both light and dark.
function heroGlow(index: number): React.CSSProperties {
  const corner = 62 - index * 9; // 62 → 26 across #1–#5
  const mid = Math.round(corner * 0.55);
  return {
    backgroundImage: `linear-gradient(135deg,
      color-mix(in oklab, var(--brand) ${corner}%, transparent) 0%,
      color-mix(in oklab, var(--brand) ${mid}%, transparent) 48%,
      transparent 80%)`,
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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
      className="group relative h-full cursor-pointer"
      onClick={onClick}
    >
      <div
        className="absolute -inset-px rounded-2xl opacity-0 blur transition-opacity duration-300 group-hover:opacity-100"
        style={heroGlow(index)}
        aria-hidden
      />
      <div className="glass-strong relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-base font-semibold tracking-tight">
            {gainer.ticker}
          </span>
          <StreakBadge count={streak} />
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
    </motion.div>
  );
}

export function GainersHero() {
  const { data } = useGainers();
  const { data: streaks } = useStreaks();
  const top = (data?.gainers ?? []).slice(0, 5);
  const [selected, setSelected] = useState<DailyGainer | null>(null);

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
                onClick={() => setSelected(g)}
              />
            ))}
      </div>
    </section>
    </>
  );
}
