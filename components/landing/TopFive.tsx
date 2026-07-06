"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lock } from "lucide-react";
import { Reveal } from "./Reveal";
import { StreakBadge } from "@/components/gainers/StreakBadge";
import { useGainers } from "@/hooks/useGainers";
import { useStreaks } from "@/hooks/useStreaks";
import { formatDayLabel, formatPrice } from "@/lib/format";
import { digitsFor, scoreDigits } from "./mystery";
import type { AIAnalysis, DailyGainer } from "@/lib/supabase/types";

// The hero's old live-data funnel, relocated: the session's real top five as
// a flat wire panel. Tickers stay public; the SCORE stays the gated tease —
// blurred deterministic digits for free visitors (mystery.ts), the real
// short_score for Pro.

function ScoreTease({
  rank,
  dateKey,
  isPro,
  proScore,
}: {
  rank: number;
  dateKey: string;
  isPro: boolean;
  proScore?: number | null;
}) {
  return (
    <span className="flex items-baseline justify-end gap-1">
      {isPro ? (
        <span className="font-mono text-sm font-bold leading-none tabular-nums">
          {proScore != null ? scoreDigits(proScore) : "—"}
        </span>
      ) : (
        <span
          className="font-mono text-sm font-bold leading-none tabular-nums blur-[4px] select-none"
          aria-hidden
        >
          {digitsFor(rank, dateKey)}
        </span>
      )}
      <span className="font-mono text-xs text-muted-foreground">/10</span>
      {!isPro && (
        <Lock
          className="ml-0.5 h-3 w-3 self-center text-muted-foreground/70"
          aria-label="Short score locked — unlocks with Pro"
        />
      )}
    </span>
  );
}

function Row({
  gainer,
  rank,
  streak,
  dateKey,
  isPro,
  proScore,
}: {
  gainer: DailyGainer;
  rank: number;
  streak?: number;
  dateKey: string;
  isPro: boolean;
  proScore?: number | null;
}) {
  const change = gainer.change_percent ?? 0;
  const decimals = Math.abs(change) >= 100 ? 0 : 1;
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/3 sm:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem_7rem_5.5rem] sm:gap-4 sm:px-6">
      <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">
        #{rank}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold tracking-tight">
            {gainer.ticker}
          </span>
          <StreakBadge count={streak} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {gainer.company_name ?? "—"}
        </span>
      </span>
      <span className="hidden sm:block">
        <ScoreTease rank={rank} dateKey={dateKey} isPro={isPro} proScore={proScore} />
      </span>
      <span className="text-right font-mono text-sm font-semibold text-up tabular-nums">
        +{change.toFixed(decimals)}%
      </span>
      <span className="hidden text-right font-mono text-sm text-muted-foreground tabular-nums sm:block">
        {formatPrice(gainer.price)}
      </span>
    </li>
  );
}

export function TopFive({ isPro }: { isPro: boolean }) {
  const { data } = useGainers();
  const { data: streaks } = useStreaks();
  const gainers = data?.gainers ?? [];
  const dateKey = data?.date ?? "";
  const top = gainers.slice(0, 5);

  // Pro score reveal — reads already-stored ai_analyses rows through the
  // existing Pro-gated endpoint (tier check + RLS). Same queryKey as
  // AIAnalysisCard so the cache is shared. This is a DB read only: it never
  // triggers thesis generation and never calls the Anthropic API.
  const { data: analyses } = useQuery({
    queryKey: ["ai-analysis", dateKey],
    queryFn: async () => {
      const res = await fetch(`/api/ai-analysis?date=${dateKey}`);
      if (!res.ok) return [] as AIAnalysis[];
      const json = (await res.json()) as { analyses: AIAnalysis[] };
      return json.analyses;
    },
    enabled: isPro && !!dateKey,
  });
  const proScores = useMemo(
    () =>
      analyses
        ? new Map(analyses.map((a) => [a.ticker, a.short_score]))
        : undefined,
    [analyses],
  );

  return (
    <section id="today" className="relative mx-auto w-full max-w-4xl px-6 pb-20">
      <Reveal>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-brand">
            The session&apos;s top five
          </h2>
          {dateKey && (
            <span className="font-mono text-xs text-muted-foreground">
              {formatDayLabel(dateKey)}
            </span>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl bg-white/2 ring-1 ring-white/7 backdrop-blur-sm">
          {top.length === 0 ? (
            <ul className="divide-y divide-white/5">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-4 py-3.5 sm:px-6">
                  <div className="h-9 animate-pulse rounded-md bg-white/4" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-white/5">
              {top.map((g, i) => (
                <Row
                  key={g.ticker}
                  gainer={g}
                  rank={i + 1}
                  streak={streaks?.get(g.ticker)}
                  dateKey={dateKey}
                  isPro={isPro}
                  proScore={proScores?.get(g.ticker)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <p>
            Real data from the latest session.{" "}
            {!isPro && "Short scores unlock with Pro."}
          </p>
          <Link
            href="/screener"
            className="group inline-flex items-center gap-1 font-medium text-brand transition-colors hover:text-foreground"
          >
            Open the screener
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
