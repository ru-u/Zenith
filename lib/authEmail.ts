// Client-side caller for POST /api/auth/email.
//
// The forms used to call supabase.auth.resend / resetPasswordForEmail directly
// from the browser, which put them outside our rate limiting and out of the
// security log. Everything goes through the route now; this is the one place
// that knows its shape.

export type AuthEmailType = "confirmation" | "password_reset";

export type AuthEmailResult =
  /** Request accepted. Says nothing about whether an account exists — by design. */
  | "ok"
  /** Our own limiter: too many requests from this address or IP. */
  | "rate_limited"
  /** Supabase's hourly send cap is exhausted — nobody is getting mail right now. */
  | "unavailable"
  | "error";

export async function requestAuthEmail(
  type: AuthEmailType,
  email: string,
): Promise<AuthEmailResult> {
  try {
    const res = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, email }),
    });
    if (res.ok) return "ok";
    if (res.status === 429) return "rate_limited";
    if (res.status === 503) return "unavailable";
    return "error";
  } catch {
    return "error";
  }
}

/**
 * User-facing copy per outcome. `unavailable` is deliberately specific: the cap
 * is global, so admitting it is exhausted leaks nothing about the address, and
 * "try again later" beats a cheerful "check your email" for a message that is
 * definitely not arriving.
 */
export function authEmailMessage(
  result: AuthEmailResult,
  type: AuthEmailType,
): string {
  switch (result) {
    case "ok":
      // Both name the junk folder: this string is read at the exact moment
      // someone is deciding whether to press the button again, and a second
      // send costs another of Resend's 100/day.
      return type === "confirmation"
        ? "Sent. Check your inbox — and your spam folder. The link is good for 24 hours."
        : "If an account exists for that email, we've sent a reset link. Check your spam folder if it doesn't appear.";
    case "rate_limited":
      return "Too many requests. Wait a few minutes and try again.";
    case "unavailable":
      return "We can't send email right now. Please try again in a little while.";
    case "error":
      return "Something went wrong. Please try again.";
  }
}
