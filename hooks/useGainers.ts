"use client";

import { useQuery } from "@tanstack/react-query";
import type { DailyGainer } from "@/lib/supabase/types";
import type { MarketStatus } from "@/lib/market-calendar";

export interface GainersResponse {
  date: string;
  asOf: string | null;
  stale: boolean;
  status: MarketStatus;
  /** Market open, but `date` is an earlier session — see GainersPayload. */
  warmingUp: boolean;
  gainers: DailyGainer[];
}

async function fetchGainers(): Promise<GainersResponse> {
  const res = await fetch("/api/gainers");
  if (!res.ok) throw new Error(`gainers request failed: ${res.status}`);
  return res.json();
}

const MINUTE = 60_000;
const TEN_MINUTES = 10 * MINUTE;

// Hits our API route (never the provider directly). Refetch cadence is set
// globally in Providers (10 min, matching the server-side cache window) —
// EXCEPT during the morning warm-up, where the provider's 15-minute delay means
// today's board appears at ~9:47 and a user who landed at 9:31 would otherwise
// sit on the previous session until their next 10-minute tick. Poll every
// minute until it lands, same shape as useAiAnalyses waiting on the 3:30 drop.
//
// The non-warming branch must return the interval EXPLICITLY: a per-query
// `refetchInterval` overrides the global default, so returning false here would
// silently switch the screener off from refreshing at all.
export function useGainers() {
  return useQuery({
    queryKey: ["gainers"],
    queryFn: fetchGainers,
    refetchInterval: (query) =>
      query.state.data?.warmingUp ? MINUTE : TEN_MINUTES,
  });
}
