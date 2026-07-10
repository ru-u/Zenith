"use client";

import { usePreferencesStore } from "@/stores/preferencesStore";
import type { DailyGainer } from "@/lib/supabase/types";

/**
 * Honors the "ticker click" preference everywhere a ticker is clickable
 * (hero cards, screener rows, history rows). Pass the chart-dialog opener;
 * returns the click handler to use.
 */
export function useTickerOpen(openChart: (g: DailyGainer) => void) {
  const tickerClick = usePreferencesStore((s) => s.tickerClick);
  return (gainer: DailyGainer) => {
    if (tickerClick === "google") {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(`${gainer.ticker} stock`)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    openChart(gainer);
  };
}
