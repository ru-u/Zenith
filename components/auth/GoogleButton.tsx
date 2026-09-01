"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Official Google "G" mark — required branding for the sign-in button.
function GoogleG() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.27a12 12 0 0 0 0 10.76l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 1.27 6.62l4.01 3.09C6.22 6.87 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" via Supabase's built-in provider (PKCE). The browser
 * is sent to Google, then back through /auth/callback which sets the same
 * session cookies as the password flow. `next` rides along as a query param.
 */
export function GoogleButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      setError(error?.message ?? "Google sign-in is unavailable right now.");
      setLoading(false);
      return;
    }
    // Preflight the authorize URL: a disabled/misconfigured provider answers
    // 400 JSON, which would otherwise strand the user on a raw error page. A
    // healthy provider answers with a redirect (opaque to fetch), which we
    // then follow for real. The abandoned probe flow is harmless — the PKCE
    // verifier lives client-side and the real navigation starts its own flow.
    try {
      const probe = await fetch(data.url, { redirect: "manual" });
      if (probe.status === 400) {
        const body = (await probe.json().catch(() => null)) as {
          msg?: string;
        } | null;
        setError(
          body?.msg ?? "Google sign-in isn't configured yet. Try the email form.",
        );
        setLoading(false);
        return;
      }
    } catch {
      // Probe blocked (network/CORS) — proceed; worst case is today's behavior.
    }
    window.location.assign(data.url);
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        // h-8 to sit on the same rhythm as the Input/Button fields below it.
        className="flex h-8 items-center justify-center gap-2.5 rounded-lg border border-foreground/10 bg-foreground/5 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-60"
      >
        <GoogleG />
        {loading ? "Redirecting to Google…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm text-down">{error}</p>}
    </>
  );
}

/** "or" divider between the Google button and the email/password fields. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-foreground/10" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        or
      </span>
      <span className="h-px flex-1 bg-foreground/10" />
    </div>
  );
}
