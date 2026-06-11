"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lock, Sparkles } from "lucide-react";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { useSubscription } from "@/hooks/useSubscription";
import { useGainers } from "@/hooks/useGainers";
import type { AIAnalysis } from "@/lib/supabase/types";

function AnalysisTile({ a }: { a: AIAnalysis }) {
  return (
    <div className="glass flex flex-col gap-2 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold tracking-tight">{a.ticker}</span>
        <RiskLevelBadge level={a.risk_level} />
      </div>
      <p className="text-sm text-muted-foreground">{a.short_thesis}</p>
      {a.key_catalysts.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {a.key_catalysts.map((c, i) => (
            <li
              key={i}
              className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {c}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs font-medium text-brand">{a.recommendation}</p>
    </div>
  );
}

function TeaserTile({ ticker }: { ticker: string }) {
  return (
    <div className="glass flex flex-col gap-2 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold tracking-tight">{ticker}</span>
        <span className="h-4 w-16 rounded-full bg-white/10" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
        <div className="h-3 w-2/3 rounded bg-white/10" />
      </div>
    </div>
  );
}

export function AIAnalysisCard() {
  const { isPro, loading } = useSubscription();
  const { data: gainers } = useGainers();
  const date = gainers?.date;
  const top = (gainers?.gainers ?? []).slice(0, 6);

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

  const header = (
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-brand" />
      <h2 className="text-lg font-semibold tracking-tight">AI short theses</h2>
      <span className="text-xs text-muted-foreground">· top movers</span>
    </div>
  );

  if (loading) {
    return (
      <section className="flex flex-col gap-3">
        {header}
        <div className="glass h-40 animate-pulse rounded-2xl" />
      </section>
    );
  }

  // Free tier: blurred teaser built from public data + upgrade CTA.
  if (!isPro) {
    return (
      <section className="flex flex-col gap-3">
        {header}
        <div className="relative overflow-hidden rounded-2xl">
          <div
            className="pointer-events-none grid select-none grid-cols-1 gap-3 blur-sm sm:grid-cols-2 lg:grid-cols-3"
            aria-hidden
          >
            {(top.length ? top.map((g) => g.ticker) : ["—", "—", "—"]).map(
              (t, i) => (
                <TeaserTile key={`${t}-${i}`} ticker={t} />
              ),
            )}
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
      </section>
    );
  }

  // Pro tier: real analyses.
  return (
    <section className="flex flex-col gap-3">
      {header}
      {analyses && analyses.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {analyses.map((a) => (
            <AnalysisTile key={a.ticker} a={a} />
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Theses are generated after each market close. Check back shortly.
        </div>
      )}
    </section>
  );
}
