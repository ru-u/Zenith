import { NextResponse } from "next/server";
import { CANONICAL_HOST, siteUrl } from "./site";

// Origin checking for cookie-authenticated, state-changing routes.
//
// Zenith's mutating endpoints authenticate with the Supabase session cookie,
// which the browser attaches to cross-site requests too. The primary defence is
// already in place — Supabase issues its cookies SameSite=Lax, and Lax withholds
// them from cross-site POSTs — but that is one library default away from being
// untrue, and it does nothing for a same-site-but-untrusted subdomain. Checking
// Origin costs a string compare and closes the gap independently.
//
// Only for browser-driven routes. The Stripe webhook (signature-verified, no
// Origin) and the cron endpoints (bearer token, called by a scheduler) must NOT
// use this.

function allowedOrigins(): Set<string> {
  const origins = new Set<string>([
    siteUrl(),
    `https://${CANONICAL_HOST}`,
    `https://www.${CANONICAL_HOST}`,
  ]);
  // The old Railway host stays live as an unlinked fallback (see CLAUDE.md), so
  // a session that started there can still write.
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) origins.add(`https://${railway}`);
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return origins;
}

/**
 * Returns a 403 when the request did not originate from this site, or null to
 * proceed.
 *
 * A missing Origin is treated as a failure, not a pass. Every browser sends
 * Origin on POST/PUT/PATCH/DELETE, so "no Origin" means a non-browser client —
 * which has no business using someone's session cookie. (Server-to-server
 * callers get their own auth: the webhook has a signature, cron has a bearer.)
 */
export function requireSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins().has(origin)) return null;

  return NextResponse.json(
    { error: "bad_origin" },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}
