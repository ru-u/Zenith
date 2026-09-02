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
export function useGainers() {
  return useQuery({ queryKey: ["gainers"], queryFn: fetchGainers });
}
