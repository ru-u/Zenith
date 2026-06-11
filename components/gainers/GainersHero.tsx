"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { CountUp } from "./CountUp";
import { StreakBadge } from "./StreakBadge";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { useGainers } from "@/hooks/useGainers";
import { useStreaks } from "@/hooks/useStreaks";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DailyGainer } from "@/lib/supabase/types";

// One distinct hover-glow gradient per card (by rank), not by magnitude.
const GRADIENTS = [
  "from-brand/30",
  "from-fuchsia-500/25",
  "from-cyan-400/25",
  "from-emerald-400/25",
  "from-amber-400/25",
];

function HeroCard({
  gainer,
  streak,
  index,
}: {
  gainer: DailyGainer;
  streak?: number;
  index: number;
}) {
  const change = gainer.change_percent ?? 0;
  // Big runners get no decimals + comma grouping so they fit inside the card.
  const decimals = Math.abs(change) >= 100 ? 0 : 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
      className="group relative h-full"
    >
      <div
        className={cn(
          "absolute -inset-px rounded-2xl bg-gradient-to-br to-transparent opacity-0 blur transition-opacity duration-300 group-hover:opacity-100",
          GRADIENTS[index % GRADIENTS.length],
        )}
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

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-br from-foreground to-brand bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            Today&apos;s top short candidates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The day&apos;s biggest market gainers, ranked highest to lowest.
          </p>
        </div>
        {data && <MarketStatusBadge status={data.status} />}
      </div>

      {/* Single ranked row, #1 → #5 left to right. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {top.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass h-[150px] animate-pulse rounded-2xl" />
            ))
          : top.map((g, i) => (
              <HeroCard
                key={g.ticker}
                gainer={g}
                streak={streaks?.get(g.ticker)}
                index={i}
              />
            ))}
      </div>
    </section>
  );
}
