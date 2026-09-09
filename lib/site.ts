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

/**
 * True when siteUrl() resolved to the dev fallback (or any loopback host)
 * rather than a real deployed origin.
 *
 * Most siteUrl() consumers can live with a localhost value — an OG tag or a
 * sitemap entry built on a dev machine is only ever read on that dev machine.
 * Outbound email is the exception: it leaves the machine, so a localhost base
 * URL becomes a dead link in a real subscriber's inbox. lib/notify.ts uses this
 * to refuse to send rather than mail an unreachable link (see the comment
 * there — the refusal also protects the once-per-day dedup claim).
 *
 * Deliberately host-based, not NODE_ENV-based: a production BUILD that lost
 * NEXT_PUBLIC_SITE_URL is the failure this most needs to catch, and it looks
 * exactly like production to NODE_ENV. Both vars are inlined at build time, so
 * that is a live possibility on every Railway rebuild.
 */
export function isLocalSiteUrl(): boolean {
  try {
    const { hostname } = new URL(siteUrl());
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return true; // unparseable is not a base URL we should mail either
  }
}
