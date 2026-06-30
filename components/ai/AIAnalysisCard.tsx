"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp, Lock, Sparkles } from "lucide-react";
import { StockChart } from "@/components/gainers/StockChart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/useSubscription";
import { useGainers } from "@/hooks/useGainers";
import { cn } from "@/lib/utils";
import type { AIAnalysis } from "@/lib/supabase/types";

// One compact, ranked row — ticker (→ chart) on the left, score + win % on the
// right, a single clamped "why it spiked" line beneath. Full detail lives on
// /analysis, so rows stay uniform regardless of how long the model wrote.
function SummaryRow({
  a,
  rank,
  onTickerClick,
}: {
  a: AIAnalysis;
  rank: number;
  onTickerClick: (ticker: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onTickerClick(a.ticker)}
            title={`View ${a.ticker} chart`}
            className="-mx-1 shrink-0 cursor-pointer rounded px-1 text-left font-semibold tracking-tight transition-colors hover:text-brand"
          >
            {a.ticker}
          </button>
          {a.short_score != null && (
            <span className="shrink-0 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
              Short {a.short_score}/10
            </span>
          )}
        </div>
        {a.catalyst && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {a.catalyst}
          </p>
        )}
      </div>
    </li>
  );
}

function TeaserTile({
  ticker,
  featured,
}: {
  ticker: string;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass flex h-full flex-col gap-2 rounded-xl p-4",
        featured && "col-span-2",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold tracking-tight">{ticker}</span>
        <span className="h-4 w-16 rounded-full bg-foreground/10" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-foreground/10" />
        <div className="h-3 w-5/6 rounded bg-foreground/10" />
        <div className="h-3 w-2/3 rounded bg-foreground/10" />
      </div>
    </div>
  );
}

export function AIAnalysisCard() {
  const { isPro, loading } = useSubscription();
  const { data: gainers } = useGainers();
  const date = gainers?.date;
  const top = (gainers?.gainers ?? []).slice(0, 5);

  const { data: analyses } = useQuery({
    queryKey: ["ai-analysis", date],
    queryFn: async () => {
      const res = await fetch(`/api/ai-analysis?date=${date}`);
      if (!res.ok) return [] as AIAnalysis[];
      const json = (await res.json()) as { analyses: AIAnalysis[] };
      return json.analyses;
    },
    enabled: isPro && !!date,
  });

  const [collapsed, setCollapsed] = useState(false);
  const [chartTicker, setChartTicker] = useState<string | null>(null);

  const renderHeader = (viewAll: boolean) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <h2 className="text-lg font-semibold tracking-tight">AI short theses</h2>
        <span className="text-xs text-muted-foreground">· top movers</span>
      </div>
      <div className="flex items-center gap-1">
        {viewAll && (
          <Link
            href="/analysis"
            className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:text-brand/80"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show more
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          )}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="flex flex-col gap-3">
        {renderHeader(false)}
        {!collapsed && <div className="glass h-40 animate-pulse rounded-2xl" />}
      </section>
    );
  }

  // Free tier: blurred teaser built from public data + upgrade CTA.
  if (!isPro) {
    return (
      <section className="flex flex-col gap-3">
        {renderHeader(false)}
        {!collapsed && (
          <div className="relative overflow-hidden rounded-2xl">
            <div
              className="pointer-events-none grid auto-rows-fr select-none grid-cols-2 gap-3 blur-sm lg:grid-cols-3"
              aria-hidden
            >
              {(top.length
                ? top.map((g) => g.ticker)
                : ["—", "—", "—", "—", "—"]
              ).map((t, i) => (
                <TeaserTile key={`${t}-${i}`} ticker={t} featured={i === 0} />
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/50 p-6 text-center backdrop-blur-[2px]">
              <span className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand">
                <Lock className="h-4 w-4" />
              </span>
              <p className="text-sm font-medium">
                Read all 5 short theses before today&apos;s close
              </p>
              <Link
                href="/upgrade"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
              >
                Upgrade to Pro · $4.99/mo
              </Link>
            </div>
          </div>
        )}
      </section>
    );
  }

  // Pro tier: the theses generated at the ~3:30 drop, ranked best→worst short by
  // short_score (tie-break on the stored rank). Self-contained (company name comes
  // from the thesis row) — NOT intersected with the live top-5, so the set stays
  // stable as the gainer list moves before the close. The home view is a compact
  // ranked summary; the full theses live on /analysis.
  const ordered = [...(analyses ?? [])]
    .sort(
      (a, b) =>
        (b.short_score ?? -1) - (a.short_score ?? -1) ||
        (a.rank ?? 99) - (b.rank ?? 99),
    )
    .slice(0, 5);
  const companyByTicker = new Map(ordered.map((a) => [a.ticker, a.company_name]));

  return (
    <section className="flex flex-col gap-3">
      <Dialog
        open={!!chartTicker}
        onOpenChange={(open) => !open && setChartTicker(null)}
      >
        <DialogContent className="sm:max-w-5xl p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-foreground/10">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {chartTicker}
              {chartTicker && companyByTicker.get(chartTicker) && (
                <span className="ml-2 font-normal text-muted-foreground">
                  — {companyByTicker.get(chartTicker)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {chartTicker && <StockChart key={chartTicker} ticker={chartTicker} />}
        </DialogContent>
      </Dialog>

      {renderHeader(ordered.length > 0)}
      {!collapsed &&
        (ordered.length > 0 ? (
          <ul className="glass divide-y divide-foreground/5 overflow-hidden rounded-2xl">
            {ordered.map((a, i) => (
              <SummaryRow
                key={a.ticker}
                a={a}
                rank={i + 1}
                onTickerClick={setChartTicker}
              />
            ))}
          </ul>
        ) : (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            Today&apos;s short theses post about 30 minutes before the close — check
            back this afternoon to trade at today&apos;s price.
          </div>
        ))}
    </section>
  );
}
