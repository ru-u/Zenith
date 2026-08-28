import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkLimit } from "./ratelimit";
import { clientIp, logSecurityEvent } from "./seclog";

// Shared bearer-token gate for the cron endpoints (/api/cron/pre-close and
// /api/cron/run-eod). Both previously carried their own copy of this check
// comparing with `===`.
//
// `===` on a secret short-circuits at the first differing byte, so response
// time leaks how many leading characters were right — enough, over enough
// requests, to recover the token one byte at a time. timingSafeEqual compares
// in constant time. The practical risk against a long random CRON_SECRET over
// the public internet is low; the fix is two lines, so the risk is not worth
// carrying.

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch — and the length check itself is
  // not a leak worth caring about, since the token length is not the secret.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Returns a 401 when the caller is not the scheduler, or null to proceed.
 * Fails closed when CRON_SECRET is unset: an unconfigured environment must not
 * expose an endpoint that triggers provider fetches and sends email.
 */
export function requireCronAuth(req: Request, route: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const ip = clientIp(req);

  const ok = Boolean(secret) && safeEqual(header, `Bearer ${secret}`);
  if (ok) return null;

  logSecurityEvent("cron.unauthorized", {
    ip,
    route,
    detail: secret ? "bad token" : "CRON_SECRET not configured",
  });

  // Cap guessing attempts regardless. Also keeps an unauthenticated caller from
  // using these endpoints as a free way to burn CPU on header parsing.
  checkLimit(req, { route: `cron:${route}`, limit: 10, windowSeconds: 300 });

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
