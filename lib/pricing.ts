// Single source of truth for the tier feature bullets. These used to be
// duplicated (and drifted) across PricingSection, ProSection, and the upgrade
// page; edit them here and every marketing surface stays in sync.
//
// Plain data, no imports — safe to consume from server and client components.
// Prose that enumerates tiers (FAQ, signup subcopy, the chart/history gates)
// can't map an array, so it's hand-maintained; keep it aligned with this list.
export const TIER_FEATURES = {
  // The screener needs no account.
  browse: [
    "Today's full screener: the day's biggest gainers, ranked",
    "Filters by price, market cap, and ticker search",
    "Live market status & close countdown",
  ],
  // A free account adds charts, streaks, favorites, and recent history.
  free: [
    "Everything in Browse",
    "Simple price charts, built for beginners",
    "Consecutive-day streak badges",
    "Favorite tickers, pinned to the top of your screener",
    "The last 5 trading days of history",
  ],
  // Pro adds the thesis, the 3:30 email, depth, and alerts.
  pro: [
    // "Quant-AI" until 2026-08-26: Haiku prose mode is not enabled, so no model
    // touches a thesis today. Don't put AI back in the paid-feature bullet
    // unless AI_PROSE_MODE=haiku is actually live.
    "Quant short thesis on the top 5, every trading day",
    "The 3:30 drop email: top movers + thesis in your inbox before the close",
    "Unlimited history + per-ticker streak history",
    "Email alerts on your favorites",
  ],
} as const;
