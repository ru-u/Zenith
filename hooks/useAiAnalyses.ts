"use client";

import { useQuery } from "@tanstack/react-query";
import type { AIAnalysis } from "@/lib/supabase/types";

const MINUTE = 60_000;

/**
 * The day's stored AI theses for Pro users (AIAnalysisCard + TopFive share
 * this query). A DB read through the Pro-gated endpoint — it never triggers
 * generation.
 *
 * Freshness is deliberately tighter than the global 10-min market-data
 * cadence: the drop lands at ~3:30 ET while users are parked on the page
 * waiting for it, and the global config (10-min interval, paused in
 * background tabs, no focus refetch) left the card empty long after theses
 * existed. Poll this tiny read every minute until the day's set arrives,
 * then stop; always refetch on focus so a returning tab catches up at once.
 */
export function useAiAnalyses(date: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["ai-analysis", date],
    queryFn: async () => {
      const res = await fetch(`/api/ai-analysis?date=${date}`);
      if (!res.ok) return [] as AIAnalysis[];
      const json = (await res.json()) as { analyses: AIAnalysis[] };
      return json.analyses;
    },
    staleTime: MINUTE,
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) > 0 ? false : MINUTE,
    refetchOnWindowFocus: true,
    enabled: enabled && !!date,
  });
}
