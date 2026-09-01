import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { logSecurityEvent } from "@/lib/seclog";
import { clientIp } from "@/lib/ratelimit";
import {
  GOOGLE_NONCE_COOKIE,
  GOOGLE_NONCE_PATH,
  safeNext,
  type GoogleNoncePayload,
} from "@/lib/googleIdentity";

export const dynamic = "force-dynamic";

const ROUTE = "auth/google-callback";

/**
 * Google documents this POST as JSON in one place and reads it as form fields
 * in its own sample code, so accept either rather than betting on one.
 */
async function readFields(request: Request): Promise<Record<string, string>> {
  const raw = await request.text();
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/**
 * Fail back to the login form, which already renders `?error=` (LoginForm seeds
 * its error state from it). Built against siteUrl(), never request.url —
 * behind Railway's proxy request.url resolves to the container's own listening
 * address, which is what once sent every Google sign-in to localhost:8080.
 */
function fail(message: string, detail?: string) {
  if (detail) console.error(`[${ROUTE}]`, detail);
  const login = new URL("/auth/login", siteUrl());
  // Outside production, surface the underlying reason on the form itself —
  // this route's failures are otherwise indistinguishable from the outside.
  login.searchParams.set(
    "error",
    detail && process.env.NODE_ENV !== "production"
      ? `${message} (${detail})`
      : message,
  );
  return NextResponse.redirect(login, 303);
}

/**
 * GIS `login_uri`: Google POSTs the ID token here after the user consents on
 * accounts.google.com, and we trade it for a Supabase session.
 *
 * DO NOT ADD requireSameOrigin TO THIS ROUTE. The POST legitimately originates
 * from accounts.google.com, so an origin check would reject every sign-in.
 * Google's `g_csrf_token` double-submit below is this route's CSRF control —
 * the same carve-out the Stripe webhook has for its signature.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const fields = await readFields(request);
  const ip = clientIp(request);

  // Double-submit: the token in the body must match the cookie GIS set on our
  // own origin. Only script running on our domain could have read that cookie.
  const csrfCookie = cookieStore.get("g_csrf_token")?.value;
  const csrfBody = fields.g_csrf_token;
  if (!csrfCookie || !csrfBody || csrfCookie !== csrfBody) {
    logSecurityEvent("input.rejected", {
      ip,
      route: ROUTE,
      detail: "g_csrf_token missing or mismatched",
    });
    return fail("Google sign-in couldn't be verified. Please try again.");
  }

  const credential = fields.credential;
  if (!credential) {
    logSecurityEvent("input.rejected", {
      ip,
      route: ROUTE,
      detail: "missing credential",
    });
    return fail(
      "Google didn't return a sign-in token. Please try again.",
      "missing credential in POST body",
    );
  }

  // The raw nonce we stashed before handing off to Google. Absent means the
  // attempt expired (5 min), the cookie was blocked, or this is a replay.
  const stored = cookieStore.get(GOOGLE_NONCE_COOKIE)?.value;
  let payload: GoogleNoncePayload | null = null;
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && "nonce" in parsed) {
        const { nonce, next } = parsed as Partial<GoogleNoncePayload>;
        if (typeof nonce === "string" && nonce) {
          payload = { nonce, next: safeNext(next) };
        }
      }
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    logSecurityEvent("input.rejected", {
      ip,
      route: ROUTE,
      detail: "missing or unreadable nonce cookie",
    });
    return fail("Your sign-in attempt expired. Please try again.");
  }

  // One nonce, one attempt — clear it before the exchange either way.
  cookieStore.delete({ name: GOOGLE_NONCE_COOKIE, path: GOOGLE_NONCE_PATH });

  // Supabase verifies the token against Google's JWKS and hashes our raw nonce
  // to compare with the token's claim. Sets the same session cookies as the
  // password flow, so proxy refresh / RLS / Pro reads are all unchanged.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce: payload.nonce,
  });

  if (error) {
    logSecurityEvent("auth.failed_login", {
      ip,
      route: ROUTE,
      detail: error.message,
    });
    return fail(
      "Google sign-in didn't complete. Please try again.",
      error.message,
    );
  }

  // 303, not the default 307: a 307 preserves the method and would re-POST this
  // body to the destination page.
  return NextResponse.redirect(new URL(payload.next, siteUrl()), 303);
}
