"use client";

import { useQuery } from "@tanstack/react-query";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const VIEWER_KEY = ["viewer"] as const;

export interface ViewerData {
  signedIn: boolean;
  isPro: boolean;
}

interface SubscriptionState {
  tier: SubscriptionTier | null; // null = signed out
  isPro: boolean;
  loading: boolean;
}

async function fetchViewer(): Promise<ViewerData> {
  const res = await fetch("/api/viewer");
  if (!res.ok) throw new Error(`viewer request failed: ${res.status}`);
  return res.json();
}

// Was a raw useEffect that ran `auth.getUser()` + a `profiles` select FROM THE
// BROWSER on every mount, with no dedupe — for two booleans the server had
// already resolved in getViewer(). <ChartDialog> calls this at its top level so
// the gate decision is ready before the first click, and <ChartDialog> is
// rendered unconditionally (mounted closed) by GainersHero, GainersTable and
// HistoryBrowser — so /screener fired the pair three times over mobile latency
// on every load, and /history once. hooks/useFavorites.ts:16 already carried a
// warning about exactly this.
//
// As a query it dedupes to one entry across all consumers, and the pages seed
// ["viewer"] server-side (lib/viewerSeed.ts) with a real `updatedAt`, so a normal
// load resolves it from the document with ZERO requests — which preserves what
// the ChartDialog comment needs (resolved before the first click) while removing
// the cost entirely.
//
// 5 minutes rather than useFavorites' hour: tier changes on the Stripe return
// leg, and a stale `isPro` gates paid content.
export function useSubscription(): SubscriptionState {
  const { data, isPending } = useQuery({
    queryKey: VIEWER_KEY,
    queryFn: fetchViewer,
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
  });

  const tier: SubscriptionTier | null = data
    ? data.signedIn
      ? data.isPro
        ? "pro"
        : "free"
      : null
    : null;

  return { tier, isPro: data?.isPro ?? false, loading: isPending };
}
