"use client";

import { useQuery } from "@tanstack/react-query";
import type { DailyGainer } from "@/lib/supabase/types";
import type { MarketStatus } from "@/lib/market-calendar";

export interface GainersResponse {
  date: string;
  asOf: string | null;
  stale: boolean;
  status: MarketStatus;
  gainers: DailyGainer[];
}

async function fetchGainers(): Promise<GainersResponse> {
  const res = await fetch("/api/gainers");
  if (!res.ok) throw new Error(`gainers request failed: ${res.status}`);
  return res.json();
}

// Hits our API route (never the provider directly). Refetch cadence is set
// globally in Providers (10 min, matching the server-side cache window).
//
// `refetchOnMount: "always"` is load-bearing, not a tuning knob. The server
// now hydrates this query from the database (lib/prefetchGainers.tsx) so the
// board paints with the HTML, and without this the hydrated data would count
// as fresh for the full 10-minute staleTime and the browser would never call
// /api/gainers. That route is where the intraday refresh, the close capture
// and the pre-close drop are triggered from — skipping it would quietly
// disable them for any visitor who doesn't stay ten minutes.
export function useGainers() {
  return useQuery({
    queryKey: ["gainers"],
    queryFn: fetchGainers,
    refetchOnMount: "always",
  });
}
