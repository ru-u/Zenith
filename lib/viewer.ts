import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import type { SubscriptionTier } from "./supabase/types";

export type ViewerProfile = {
  subscription_tier: SubscriptionTier;
  created_at: string;
};

export type Viewer = {
  user: User | null;
  profile: ViewerProfile | null;
  isPro: boolean;
};

// Who's asking, resolved once per request.
//
// <Header> renders in the root layout and needs the user + their tier on every
// page; each page then needed the same two facts for its own gating. Both ran
// their own `auth.getUser()` + `profiles` select, so a single landing render
// made FIVE sequential Supabase round trips (proxy.ts refreshes the session
// first) where two were byte-identical duplicates of the other two — pure
// serial latency in front of the HTML, and worst on exactly the slow school
// networks this app is used on.
//
// React's `cache()` memoizes for the life of one request, which is the right
// scope here: nothing is shared between users, and the next request re-reads.
// Next's automatic memoization only covers `fetch`, and the Supabase client
// doesn't route through it — so this wrapper is required, not decorative.
// (See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
// generate-metadata.md — `cache` is the documented answer when fetch isn't
// involved.)
//
// `created_at` is selected because /settings needs it; it costs nothing extra
// on a row we're already fetching, and keeps every caller on one query.
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null, isPro: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, created_at")
    .eq("id", user.id)
    .maybeSingle<ViewerProfile>();

  return {
    user,
    profile: profile ?? null,
    isPro: profile?.subscription_tier === "pro",
  };
});
