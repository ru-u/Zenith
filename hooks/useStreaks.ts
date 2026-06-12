"use client";

import { useQuery } from "@tanstack/react-query";
import type { TickerStreak } from "@/lib/supabase/types";

async function fetchStreaks(): Promise<Map<string, number>> {
  const res = await fetch("/api/streaks");
  if (!res.ok) throw new Error(`streaks request failed: ${res.status}`);
  const json = (await res.json()) as { streaks: TickerStreak[] };
  return new Map(json.streaks.map((s) => [s.ticker, s.streak_count]));
}

// Streaks change at most once per trading day — long stale time, no polling.
export function useStreaks() {
  return useQuery({
    queryKey: ["streaks"],
    queryFn: fetchStreaks,
    staleTime: 60 * 60 * 1000,
    refetchInterval: false,
  });
}
