import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSameOrigin } from "@/lib/csrf";
import { checkLimit } from "@/lib/ratelimit";
import {
  GOOGLE_NONCE_COOKIE,
  GOOGLE_NONCE_COOKIE_OPTIONS,
  GOOGLE_NONCE_TTL_SECONDS,
  randomNonce,
  safeNext,
  sha256Hex,
} from "@/lib/googleIdentity";

export const dynamic = "force-dynamic";

/**
 * Mints the nonce pair for one Google Identity Services sign-in attempt.
 *
 * The nonce is one secret in two forms: Google embeds the SHA-256 hash of it as
 * the `nonce` claim in the ID token, and Supabase Auth re-hashes the raw value
 * we hand it and compares. That is what proves the token was minted for this
 * attempt and isn't a replay of an older one.
 *
 * In redirect mode the raw value has to survive a round trip through Google, so
 * it can't live in a JS closure — it goes in a short-lived HttpOnly cookie that
 * only /api/auth/google-callback reads. Only the hash is ever returned to the
 * browser. `next` rides in the same cookie because GIS `login_uri` must match a
 * registered redirect URI exactly, leaving no room for a query param.
 */
export async function POST(request: Request) {
  const badOrigin = requireSameOrigin(request);
  if (badOrigin) return badOrigin;

  // Cheap route, but it sets a cookie and burns entropy on every call — enough
  // to be worth a ceiling. Generous: a shared school NAT hits one IP.
  const limited = checkLimit(request, {
    route: "google-nonce",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    next?: unknown;
  } | null;
  const next = safeNext(body?.next);

  const nonce = randomNonce();
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_NONCE_COOKIE, JSON.stringify({ nonce, next }), {
    ...GOOGLE_NONCE_COOKIE_OPTIONS,
    maxAge: GOOGLE_NONCE_TTL_SECONDS,
  });

  return NextResponse.json(
    { hashedNonce: await sha256Hex(nonce) },
    { headers: { "cache-control": "no-store" } },
  );
}
