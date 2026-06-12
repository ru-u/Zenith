"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SubscriptionTier } from "@/lib/supabase/types";

interface SubscriptionState {
  tier: SubscriptionTier | null; // null = signed out
  isPro: boolean;
  loading: boolean;
}

export function useSubscription(): SubscriptionState {
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) {
          setTier(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .maybeSingle<{ subscription_tier: SubscriptionTier }>();
      if (active) {
        setTier(data?.subscription_tier ?? "free");
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { tier, isPro: tier === "pro", loading };
}
