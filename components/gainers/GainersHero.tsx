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

// Heat tint by change magnitude (proxy until Pro AI risk levels are wired in).
function heat(changePercent: number | null): string {
  const c = changePercent ?? 0;
  if (c >= 100) return "from-rose-500/30";
  if (c >= 50) return "from-orange-500/25";
  if (c >= 25) return "from-amber-400/20";
  return "from-brand/25";
}

function HeroCard({
  gainer,
  streak,
  index,
}: {
  gainer: DailyGainer;
  streak?: number;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
      className="group relative"
    >
      <div
        className={cn(
          "absolute -inset-px rounded-2xl bg-gradient-to-br to-transparent opacity-0 blur transition-opacity duration-300 group-hover:opacity-100",
          heat(gainer.change_percent),
        )}
        aria-hidden
      />
      <div className="glass-strong relative flex flex-col gap-3 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">
            {gainer.ticker}
          </span>
          <StreakBadge count={streak} />
        </div>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {gainer.company_name ?? " "}
        </p>
        <div className="flex items-end justify-between">
          <span className="flex items-center gap-1 text-2xl font-bold text-up">
            <TrendingUp className="h-5 w-5" />
            <CountUp value={gainer.change_percent ?? 0} prefix="+" suffix="%" />
          </span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatPrice(gainer.price)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function GainersHero() {
  const { data } = useGainers();
  const { data: streaks } = useStreaks();
  const top = (data?.gainers ?? []).slice(0, 6);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-br from-foreground to-brand bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            Today&apos;s top short candidates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The day&apos;s biggest market gainers, ranked.
          </p>
        </div>
        {data && <MarketStatusBadge status={data.status} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {top.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass h-[136px] animate-pulse rounded-2xl" />
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
