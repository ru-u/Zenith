// Shared pieces of the Google Identity Services (GIS) sign-in flow.
//
// WHY THIS EXISTS AT ALL: Supabase's signInWithOAuth sends the browser to
// <project-ref>.supabase.co/auth/v1/callback, and Google names that host on the
// consent screen — "Sign in to lmpdpaovmcshpahcishr.supabase.co", which reads
// as a phishing page to an audience of high-school students. Google only shows
// an app *name* to verified brands, and we cannot verify supabase.co because we
// don't own it. GIS issues the ID token against our own JavaScript origin
// instead, so the screen reads "zenithscreener.com".
//
// Supabase remains the session authority. The ID token goes to
// signInWithIdToken, which mints the same access/refresh pair, matches the same
// auth.users row (provider + `sub`), fires the same handle_new_user trigger,
// and sets the same cookies as every other auth path. Nothing forks.

export const GOOGLE_NONCE_COOKIE = "zenith-g-nonce";

/** Path the nonce cookie is scoped to — both halves of the flow live under it. */
export const GOOGLE_NONCE_PATH = "/api/auth";

// Long enough to read a consent screen, short enough that a captured cookie is
// worthless by the time anyone could use it.
export const GOOGLE_NONCE_TTL_SECONDS = 300;

/**
 * SameSite=None is REQUIRED here, not a preference.
 *
 * Google returns the credential as a cross-site top-level POST, and SameSite=Lax
 * cookies are withheld from those — Lax only rides safe-method (GET)
 * navigations. With Lax this cookie is absent on 100% of production sign-ins
 * while looking perfectly correct in the code. None requires Secure; Chrome
 * treats http://localhost as a trustworthy origin, so dev still works.
 */
export const GOOGLE_NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "none",
  secure: true,
  path: GOOGLE_NONCE_PATH,
} as const;

export type GoogleNoncePayload = { nonce: string; next: string };

/** SHA-256 as lowercase hex — the representation Supabase Auth hashes to. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * 32 random bytes as hex. Hex rather than base64 because the value has to
 * survive a round trip through a JWT claim, and `+` `/` `=` are needless risk
 * there for zero benefit.
 */
export function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Same-site relative paths only — the identical rule app/auth/callback/route.ts
 * applies to its `next`. A full URL here would be an open redirect, and this
 * one arrives out of a cookie, so it gets the same treatment as a query param.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/screener";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/screener";
}
