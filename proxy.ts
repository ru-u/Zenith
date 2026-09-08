import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next.js 16 renamed the "middleware" convention to "proxy".
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie. Also gate /history behind auth.
  //
  // getClaims(), not getUser(): getUser() ALWAYS posts to Supabase's /auth/v1/user
  // to validate the token, so every signed-in navigation paid a network round trip
  // here before any rendering began. getClaims() verifies the JWT locally against a
  // cached JWKS via WebCrypto — no network — and still refreshes a session that is
  // close to expiring, which is the job this proxy exists to do.
  //
  // That local path requires the project to be on ASYMMETRIC JWT signing keys. On
  // the legacy shared-secret (HS256) setup, or with no `kid`, auth-js falls back to
  // a server round trip equivalent to getUser() — so this is behaviour-neutral
  // today and turns into the saving the moment the keys are migrated. See
  // docs/AUTH-JWT-KEYS.md.
  //
  // Note guests were never charged for this either way: getUser/getClaims
  // short-circuit with AuthSessionMissingError when there is no session cookie and
  // make no request at all. The cost — and this fix — are signed-in only.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  if (!userId && request.nextUrl.pathname.startsWith("/history")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // `api/` is excluded deliberately. Every route handler authenticates itself
    // (they must — they are reachable directly), so running this proxy in front
    // of them re-validated the same token a second time on every single call:
    // the 10-minute /api/gainers poll, /api/streaks, /api/favorites, the
    // 1-minute /api/ai-analysis poll, and every date-chip tap on /history.
    //
    // Safe for session refresh, which is the subtle part: `setAll` in
    // lib/supabase/server.ts is only swallowed inside Server Components, which
    // cannot write cookies — ROUTE HANDLERS can and do persist a refreshed
    // token themselves. Page navigations still run through here, which is what
    // Server Components rely on.
    //
    // robots/sitemap/llms are public, static and session-free.
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
