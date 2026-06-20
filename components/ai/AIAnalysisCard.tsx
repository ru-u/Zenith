"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Lock, Sparkles } from "lucide-react";
import { RiskLevelBadge } from "./RiskLevelBadge";
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

function AnalysisTile({
  a,
  featured,
  onTickerClick,
}: {
  a: AIAnalysis;
  featured?: boolean;
  onTickerClick: (ticker: string) => void;
}) {
  return (
    <div
      className={cn(
        "glass flex h-full flex-col rounded-xl",
        featured ? "col-span-2 gap-3 p-6" : "gap-2 p-4",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Only the ticker is clickable — opens that ticker's chart. */}
        <button
          type="button"
          onClick={() => onTickerClick(a.ticker)}
          title={`View ${a.ticker} chart`}
          className={cn(
            "-mx-1 cursor-pointer truncate rounded px-1 text-left font-semibold tracking-tight transition-colors hover:text-brand",
            featured && "text-2xl",
          )}
        >
          {a.ticker}
        </button>
        <RiskLevelBadge level={a.risk_level} />
      </div>
      <p
        className={cn(
          "text-muted-foreground",
          featured ? "text-base leading-relaxed" : "text-sm",
        )}
      >
        {a.short_thesis}
      </p>
      {a.key_catalysts.length > 0 && (
        <ul className={cn("flex flex-wrap", featured ? "gap-1.5" : "gap-1")}>
          {a.key_catalysts.map((c, i) => (
            <li
              key={i}
              className={cn(
                "rounded-md bg-foreground/5 text-muted-foreground",
                featured ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
              )}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
      <p
        className={cn(
          "mt-auto pt-1 font-medium text-brand",
          featured ? "text-sm" : "text-xs",
        )}
      >
        {a.recommendation}
      </p>
    </div>
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
  const companyByTicker = new Map(top.map((g) => [g.ticker, g.company_name]));

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <h2 className="text-lg font-semibold tracking-tight">AI short theses</h2>
        <span className="text-xs text-muted-foreground">· top movers</span>
      </div>
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
  );

  if (loading) {
    return (
      <section className="flex flex-col gap-3">
        {header}
        {!collapsed && (
          <div className="glass h-40 animate-pulse rounded-2xl" />
        )}
      </section>
    );
  }

  // Free tier: blurred teaser built from public data + upgrade CTA.
  if (!isPro) {
    return (
      <section className="flex flex-col gap-3">
        {header}
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
              Claude short theses are a Pro feature
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

  // Pro tier: real analyses, ordered by today's rank, capped to the top 5.
  const byTicker = new Map((analyses ?? []).map((a) => [a.ticker, a]));
  const ordered = top
    .map((g) => byTicker.get(g.ticker))
    .filter((a): a is AIAnalysis => Boolean(a));

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

      {header}
      {!collapsed &&
        (ordered.length > 0 ? (
        <div className="grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-3">
          {ordered.map((a, i) => (
            <AnalysisTile
              key={a.ticker}
              a={a}
              featured={i === 0}
              onTickerClick={setChartTicker}
            />
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Theses are generated after each market close. Check back shortly.
        </div>
        ))}
    </section>
  );
}
