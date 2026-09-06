// Single source of truth for the tier feature bullets. These used to be
// duplicated (and drifted) across PricingSection, ProSection, and the upgrade
// page; edit them here and every marketing surface stays in sync.
//
// Plain data, no imports — safe to consume from server and client components.
// Prose that enumerates tiers (FAQ, signup subcopy, the chart/history gates)
// can't map an array, so it's hand-maintained; keep it aligned with this list.

/**
 * What Pro costs *new* subscribers, for display only. The amount actually
 * charged lives on the Stripe Price object (STRIPE_PRICE_ID) and is set in the
 * dashboard — these are two separate switches and they can drift, so if you
 * change this string, change the Price too, and vice versa.
 *
 * Raised $4.99 → $9.99 on 2026-09-01. Stripe never migrates a live
 * subscription to a new Price on its own, so everyone who subscribed before
 * that date is grandfathered at $4.99: NEVER use this constant to describe an
 * existing subscriber's own plan (see app/settings/page.tsx). Marketing and
 * the checkout CTA only, where the reader is by definition a new buyer.
 */
export const PRO_PRICE = "$9.99";

/** `PRO_PRICE` with the interval, for CTAs that quote it inline. */
export const PRO_PRICE_MONTHLY = `${PRO_PRICE}/mo`;
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
    "Interactive price charts, built for all levels",
    "Consecutive-day streak badges",
    "Favorite tickers, pinned to the top of your screener",
    "The last 5 trading days of history",
  ],
  // Pro adds the thesis, the 3:30 email, and full history depth.
  pro: [
    // Says "Quant" and not "Quant-AI" on purpose, and it stays that way in
    // BOTH prose modes: the engine computes every figure either way, and Haiku
    // (when enabled) only rewrites the wording. Copy across the site is written
    // to be true regardless of AI_PROSE_MODE so the flip stays config-only —
    // don't couple this bullet to the flag.
    "Everything in Free account",
    "Quant short thesis on the top 5, every trading day",
    "The 3:30 drop email: top movers + thesis in your inbox before the close",
    "Unlimited history: all of Zenith's past trading days",
  ],
} as const;
