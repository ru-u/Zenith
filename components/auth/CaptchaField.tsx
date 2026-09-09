"use client";

import { useCallback, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/useMounted";

// Cloudflare Turnstile, feeding Supabase's project-wide CAPTCHA protection.
//
// WHY THIS EXISTS: `supabase.auth.signUp` runs browser -> Supabase directly, so
// it never touches our server and none of lib/ratelimit.ts applies to it. That
// makes /auth/v1/signup — reachable by anyone holding the anon key, which ships
// in every JS bundle — the cheapest way to drain the project's 50/HOUR auth
// email budget (lib/emailBudget.ts). On 2026-09-08 that budget was exhausted
// with 7 Pro subscribers on the books, i.e. nothing to do with the pre-close
// drop. A CAPTCHA is the only control that reaches a path our own middleware
// never sees.
//
// SUPABASE'S SETTING IS PROJECT-WIDE, NOT PER-ENDPOINT. Turning it on in
// Authentication -> Bot and Abuse Protection makes GoTrue demand a token on
// EVERY password-auth endpoint at once — signup, sign-in, recover, resend. So
// all four of our forms need a widget, not just the signup one, and a form that
// forgets it breaks completely rather than degrading. That is why this is one
// shared hook and not four hand-rolled copies.
//
// The secret key is NOT in this repo and must never be. It is pasted into the
// Supabase dashboard, which is what verifies the token; we only ever handle the
// public site key.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** True when a site key is configured, i.e. when widgets actually render. */
export const captchaConfigured = Boolean(SITE_KEY);

export type Captcha = {
  /**
   * Pass to Supabase as `options.captchaToken`. Undefined until the widget
   * solves — and undefined forever when no site key is set, which is what keeps
   * dev working before the key exists.
   */
  token: string | undefined;
  /** Render inside the form. Renders nothing when no site key is configured. */
  field: React.ReactNode;
  /**
   * MUST be called on every failed submit. Turnstile tokens are SINGLE USE: the
   * moment Supabase reads one it is spent, so a form that leaves the old token
   * in state after a rejected attempt sends a burnt token on the retry and the
   * user gets a captcha error they cannot clear by trying again — which looks
   * exactly like a broken form. This is the single easiest thing to get wrong
   * here.
   */
  reset: () => void;
};

export function useCaptcha(): Captcha {
  const [token, setToken] = useState<string>();
  const widget = useRef<TurnstileInstance>(undefined);

  const reset = useCallback(() => {
    setToken(undefined);
    widget.current?.reset();
  }, []);

  const field = (
    <CaptchaField
      widgetRef={widget}
      onToken={setToken}
    />
  );

  return { token, field, reset };
}

function CaptchaField({
  widgetRef,
  onToken,
}: {
  widgetRef: React.RefObject<TurnstileInstance | undefined>;
  onToken: (token: string | undefined) => void;
}) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();

  // Unset key => render nothing and hand back no token. Mirrors how
  // NEXT_PUBLIC_GOOGLE_CLIENT_ID unset falls back to the redirect flow: a
  // missing public key degrades instead of throwing. Note Turnstile itself
  // treats an empty siteKey as a render error, so this guard is required, not
  // just tidy.
  if (!SITE_KEY) return null;

  return (
    <Turnstile
      ref={widgetRef}
      siteKey={SITE_KEY}
      // Turnstile's "flexible" size is 100% width with a HARD 300px minimum,
      // and the auth card's content box is 288px (max-w-sm 384 − px-6 48 −
      // p-6 48). Left alone the widget renders 300px and breaks 12px out
      // through the card's right padding. -mx-1.5 hands back exactly those
      // 12px so it sits centred on the fields instead of overhanging them.
      className="-mx-1.5"
      onSuccess={onToken}
      // Both are recoverable and both must clear the stale token, or the next
      // submit ships an expired one. Turnstile re-renders itself on expiry
      // (refreshExpired defaults to "auto"), so the user usually sees nothing.
      onExpire={() => onToken(undefined)}
      onError={() => onToken(undefined)}
      options={{
        // "auto" would follow prefers-color-scheme, which is wrong whenever the
        // user has picked a theme explicitly via next-themes. Stay on "auto"
        // until hydration so the widget can't cause a mismatch (useMounted).
        theme: !mounted ? "auto" : resolvedTheme === "light" ? "light" : "dark",
        // Render nothing unless Cloudflare actually wants a challenge. The
        // widget still runs and still issues a token for everyone else — this
        // suppresses the BOX, not the check.
        //
        // Always-on, it was a 65px slab in a form whose every other control is
        // 40px, which made a third-party bot check the largest and loudest
        // element on the signup page. It also meant ResendConfirmation, which
        // needs a token of its own, rendered a SECOND visible widget nested
        // inside the success notice.
        //
        // Cost: when a challenge IS required the box appears and pushes the
        // submit button down. That is the right moment to spend layout shift.
        appearance: "interaction-only",
        // Only applies when a challenge does surface: fills the form column
        // instead of Turnstile's fixed 300px, which is narrower than the auth
        // inputs and reads as a misaligned foreign box.
        size: "flexible",
      }}
    />
  );
}
