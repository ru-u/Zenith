import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PKCE callback: Supabase redirects here with a one-time `code` after the
 * provider consent screen (OAuth) or a password-recovery email link.
 * Exchanging it sets the same session cookies the password flow uses, so
 * everything downstream (proxy refresh, RLS, Pro-tier reads, the profiles
 * trigger) is shared — no parallel auth path.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // Only same-site relative paths — a full URL here would be an open redirect.
  const rawNext = url.searchParams.get("next") ?? "/screener";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/screener";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("[auth/callback] code exchange:", error.message);
  }

  // Recovery links fail into the reset page's error state (it explains the
  // one-use / same-browser rules), not the login form.
  if (next.startsWith("/reset-password")) {
    const reset = new URL("/reset-password", url.origin);
    reset.searchParams.set("error", "link");
    return NextResponse.redirect(reset);
  }

  // Provider errors (user canceled, misconfiguration) or a missing/spent code
  // land back on the login page with a readable message.
  const message =
    url.searchParams.get("error_description") ??
    "Google sign-in didn't complete. Please try again.";
  const login = new URL("/auth/login", url.origin);
  login.searchParams.set("error", message);
  if (next !== "/screener") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
