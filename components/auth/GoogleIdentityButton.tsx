"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/useMounted";
import { GoogleButton } from "./GoogleButton";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_ID = "gsi-client-script";
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// If Google's button hasn't rendered by now, assume it never will and show the
// Supabase redirect button instead. Long enough for a slow phone on school
// wifi, short enough that nobody sits looking at a skeleton.
const READY_TIMEOUT_MS = 2500;

type GsiIdApi = {
  initialize(config: {
    client_id: string;
    login_uri: string;
    ux_mode: "redirect" | "popup";
    nonce: string;
    context?: "signin" | "signup" | "use";
    itp_support?: boolean;
    auto_select?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard" | "icon";
      theme: "outline" | "filled_blue" | "filled_black";
      size: "large" | "medium" | "small";
      text: "signin_with" | "signup_with" | "continue_with";
      shape: "rectangular" | "pill";
      logo_alignment: "left" | "center";
      width?: number;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GsiIdApi } };
  }
}

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    // Same dedupe/onload shape as the TradingView loader in StockChart: both
    // auth pages can mount this, and neither should fetch the library twice.
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi load")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi load"));
    document.head.appendChild(script);
  });
}

/**
 * "Continue with Google" via Google Identity Services, so the consent screen
 * names zenithscreener.com instead of the Supabase project host. See
 * lib/googleIdentity.ts for why that matters and how the nonce works.
 *
 * ux_mode is "redirect" for every browser, not just the ones that require it.
 * iOS Safari's ITP forces redirect mode anyway, and using it universally means
 * one code path, no popup-blocker failure mode, and — the reason it's worth
 * choosing outright — no need to relax the Cross-Origin-Opener-Policy:
 * same-origin header in next.config.ts, which popup mode would have demanded.
 *
 * Falls back to the Supabase redirect button (GoogleButton) when the client ID
 * is unset, the library is blocked, or nothing renders in time. That covers
 * in-app webviews, where Google explicitly doesn't support GIS — a real case
 * here, since a lot of this audience arrives from social apps.
 */
export function GoogleIdentityButton({ next }: { next: string }) {
  // With no client ID there is nothing to initialize, and that's knowable at
  // render time — deciding it in an effect would just cause a second render.
  if (!CLIENT_ID) return <GoogleButton next={next} />;
  return <GisButton next={next} clientId={CLIENT_ID} />;
}

function GisButton({ next, clientId }: { next: string; clientId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The nonce/initialize handshake must happen exactly ONCE per mount. React
  // StrictMode double-invokes effects in dev, and `mounted` and `buttonTheme`
  // can each trigger another run — every extra run would mint a fresh nonce and
  // overwrite the cookie, leaving the already-initialized GIS button carrying
  // the *previous* hash. The callback then rejects a token whose nonce claim
  // doesn't match the cookie, which looks exactly like a broken nonce
  // implementation rather than a duplicated one.
  const setupRef = useRef<Promise<void> | null>(null);
  const [mode, setMode] = useState<"loading" | "gis" | "fallback">("loading");
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  // Wait for the resolved theme before rendering, so Google's button doesn't
  // paint light-on-light and then swap.
  const buttonTheme = resolvedTheme === "light" ? "outline" : "filled_black";

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setMode((m) => (m === "gis" ? m : "fallback"));
    }, READY_TIMEOUT_MS);

    setupRef.current ??= (async () => {
      // The server keeps the raw nonce in a cookie and returns only its hash,
      // which is what Google embeds in the token.
      const res = await fetch("/api/auth/google-nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ next }),
      });
      if (!res.ok) throw new Error("nonce");
      const { hashedNonce } = (await res.json()) as { hashedNonce?: string };
      if (!hashedNonce) throw new Error("nonce");

      await loadGsiScript();
      const id = window.google?.accounts?.id;
      if (!id) throw new Error("gsi");

      id.initialize({
        client_id: clientId,
        login_uri: `${window.location.origin}/api/auth/google-callback`,
        ux_mode: "redirect",
        nonce: hashedNonce,
        context: "signin",
        itp_support: true,
      });
    })();

    setupRef.current
      .then(() => {
        if (cancelled) return;
        const id = window.google?.accounts?.id;
        const el = containerRef.current;
        if (!id || !el) throw new Error("gsi");

        // Re-rendering the button is cheap and safe to repeat; only the
        // initialize above must not be.
        el.innerHTML = "";
        id.renderButton(el, {
          type: "standard",
          theme: buttonTheme,
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          // GIS only accepts 200–400px; the auth card is ~328px inside its padding.
          width: Math.round(Math.min(400, Math.max(200, el.clientWidth || 328))),
        });
        setMode("gis");
      })
      .catch(() => {
        if (!cancelled) setMode("fallback");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [next, clientId, buttonTheme, mounted]);

  return (
    <>
      {/* Kept mounted (just hidden) so the ref is valid when renderButton runs. */}
      <div
        ref={containerRef}
        className={mode === "gis" ? "flex min-h-[44px] justify-center" : "hidden"}
      />
      {mode === "loading" && (
        <div
          aria-hidden
          className="h-[44px] animate-pulse rounded-lg border border-foreground/10 bg-foreground/5"
        />
      )}
      {mode === "fallback" && <GoogleButton next={next} />}
    </>
  );
}
