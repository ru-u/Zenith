// Single source of truth for the app's public base URL.
//
// Before this existed, three call sites each derived it differently —
// app/layout.tsx read only NEXT_PUBLIC_SITE_URL, the Stripe routes read only
// NEXT_PUBLIC_APP_URL, and lib/notify.ts read both. Since SITE_URL was set
// nowhere, metadataBase silently resolved to localhost in production and every
// OG image URL pointed at a dev machine. One helper, one precedence order.
//
// Both vars are NEXT_PUBLIC_*, so they are inlined at build time: changing them
// on Railway requires a rebuild, not just a restart.
//
// The localhost fallback is a dev convenience only — production correctness
// comes from the env var being set, not from this string.

export const CANONICAL_HOST = "zenithscreener.com";

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
