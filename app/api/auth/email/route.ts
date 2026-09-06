import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLimit } from "@/lib/ratelimit";
import { requireSameOrigin } from "@/lib/csrf";
import { clientIp, logSecurityEvent } from "@/lib/seclog";
import { maybeAlert } from "@/lib/alerts";
import { getTodayET } from "@/lib/market-calendar";
import {
  RESEND_EMAILS_PER_DAY,
  SUPABASE_AUTH_EMAIL_PER_HOUR,
} from "@/lib/emailBudget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sends the two auth emails a user can ask for themselves: a fresh signup
// confirmation, and a password reset.
//
// Both used to go browser -> Supabase directly, which meant our rate limiter
// never saw them and we had no visibility into abuse of the one thing here that
// costs money and reputation. Routing them through the server is the whole
// point: every attempt now passes checkLimit and lands in the security log.
//
// Budget context (see CLAUDE.md): Supabase caps auth email at 50/HOUR, and
// Resend's account quota caps EVERYTHING — auth email plus the pre-close drop —
// at 100/day on the free tier. Resend is the binding one: an hour of Supabase's
// allowance would spend half of Resend's day. Signups bypass this route
// entirely (SignupForm calls supabase.auth.signUp from the browser), so the
// limits below deliberately claim only part of the hourly budget and leave the
// rest for them.

const MAX_EMAIL_LENGTH = 254; // RFC 5321
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per address: a single mailbox cannot be used to drain the budget.
const PER_ADDRESS_LIMIT = 3;
// Per IP: stops one client cycling addresses to get around the above.
const PER_IP_LIMIT = 5;
// Across the whole route: the one that actually protects signups, which bypass
// it entirely (SignupForm calls supabase.auth.signUp from the browser) and so
// have no limiter of their own. Under half of SUPABASE_AUTH_EMAIL_PER_HOUR, so
// resends and resets can never crowd out people creating accounts.
//
// Size this against the HOURLY Supabase cap, not against Resend's daily quota —
// they are different budgets in different units (lib/emailBudget.ts). Briefly
// cut to 3 on 2026-09-04 by reading the Supabase cap as 50/day; restored.
const GLOBAL_LIMIT = 15;
const WINDOW_SECONDS = 3600;

type RequestType = "confirmation" | "password_reset";

/**
 * Rate-limit key for an address. Hashed so a long-lived in-memory map never
 * holds a list of user email addresses.
 */
function addressKey(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

// Identical whatever happened — including when the address has no account.
// Mirrors the enumeration safety ForgotPasswordForm has always had: the caller
// must not be able to tell registered addresses from unregistered ones.
const GENERIC_OK = { ok: true } as const;

export async function POST(req: Request) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  // requireSameOrigin has already proven this is one of ours, which is what
  // makes it safe to build a redirect from. Using it rather than siteUrl()
  // preserves the dev/prod split SignupForm documents — a localhost signup must
  // confirm back to localhost, not into production.
  const origin = req.headers.get("origin")!;
  const ip = clientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const rawType = (body as { type?: unknown })?.type;
  const rawEmail = (body as { email?: unknown })?.email;

  const type: RequestType | null =
    rawType === "confirmation" || rawType === "password_reset" ? rawType : null;
  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (
    !type ||
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_RE.test(email)
  ) {
    logSecurityEvent("input.rejected", {
      ip,
      route: "POST /api/auth/email",
      detail: `type=${String(rawType)}`,
    });
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Most specific budget first. A request rejected by a later check has already
  // consumed a slot in the earlier one — imprecise, but it errs toward sending
  // fewer emails, which is the direction we want to be wrong in.
  const limits = [
    {
      route: "auth-email:address",
      limit: PER_ADDRESS_LIMIT,
      key: addressKey(email),
    },
    { route: "auth-email:ip", limit: PER_IP_LIMIT, key: undefined },
    { route: "auth-email:global", limit: GLOBAL_LIMIT, key: "all" },
  ];
  for (const { route, limit, key } of limits) {
    const limited = checkLimit(req, {
      route,
      limit,
      windowSeconds: WINDOW_SECONDS,
      key,
    });
    if (limited) {
      logSecurityEvent("ratelimit.exceeded", {
        ip,
        email,
        route: `POST /api/auth/email (${route})`,
      });
      return limited;
    }
  }

  // Anon key, server side. The service role cannot send these — only the public
  // auth API can — and calling it here rather than from the browser is what
  // puts every attempt behind the limits above.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } =
    type === "confirmation"
      ? await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${origin}/auth/callback` },
        })
      : await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });

  if (error) {
    // Two ways the mail can fail to leave, and they need different responses to
    // ops even though the caller sees the same thing.
    //
    // 1. Supabase's own daily ceiling — a free dashboard toggle.
    const rateLimited =
      error.status === 429 || error.code === "over_email_send_rate_limit";
    // 2. The send failed UNDERNEATH Supabase — SMTP refused, Resend's daily
    //    quota exhausted, GoTrue erroring. This arrives as a 5xx and matches
    //    NEITHER condition above, so before this branch existed it fell into the
    //    swallow at the bottom: one console line, then `GENERIC_OK`, which tells
    //    the user "Sent. Check your inbox" for mail that does not exist. No
    //    alert fired, because `resend_quota_exhausted` is only raised by the
    //    pre-close batch in notify.ts, which this path never touches.
    const sendFailed = !rateLimited && (error.status ?? 0) >= 500;

    // Both are safe to report honestly: neither depends on the address, so a
    // 503 here reveals nothing that a 200 wouldn't. Only the 4xx account-state
    // errors below have to stay indistinguishable.
    if (rateLimited || sendFailed) {
      const admin = createAdminClient();

      if (sendFailed) {
        console.error("[auth/email] provider send failure:", error.message);
        await maybeAlert(admin, {
          date: getTodayET(),
          type: "auth_email_send_failed",
          subject: "Zenith: auth email is failing to send (provider error)",
          body: [
            "Supabase returned a server error instead of sending an auth email",
            "(confirmation or password reset). The request was accepted by us and",
            "rejected below Supabase, at the SMTP/provider layer.",
            "",
            `Most likely: Resend's ${RESEND_EMAILS_PER_DAY}/DAY account quota is exhausted.`,
            "It is shared with the pre-close drop, which spends one email per Pro",
            "subscriber per trading day. Check Resend first.",
            "",
            "Also possible: the Supabase custom SMTP credentials are wrong, or the",
            "sender domain fell out of verification.",
            "",
            `Supabase's message was: ${error.message}`,
            "",
            "Until this clears, nobody can confirm a new account or reset a",
            "password.",
            "",
            "One alert per day; further failures today will not re-send this.",
          ].join("\n"),
        });
      } else {
        console.error("[auth/email] Supabase refused — hourly cap reached");
        await maybeAlert(admin, {
          date: getTodayET(),
          type: "auth_email_rate_limited",
          subject: "Zenith: Supabase auth-email hourly cap reached",
          body: [
            `Supabase refused an auth email: the hourly send limit of ${SUPABASE_AUTH_EMAIL_PER_HOUR}/HOUR`,
            "is exhausted. Anyone signing up right now is NOT receiving their",
            "confirmation email, and will not be able to sign in until it clears.",
            "",
            "Raise it: Supabase -> Authentication -> Rate Limits ->",
            "'Rate limit for sending emails'.",
            "",
            `The ceiling underneath is Resend's ${RESEND_EMAILS_PER_DAY}/DAY account quota,`,
            "shared with the pre-close drop — which spends one email per Pro",
            "subscriber per trading day. Check Resend's remaining quota before",
            "raising this: past it the failure moves underneath Supabase and",
            "arrives as a 5xx mid-send (auth_email_send_failed) instead.",
            "",
            "One alert per day; further refusals today will not re-send this.",
          ].join("\n"),
        });
      }

      return NextResponse.json(
        { error: "email_temporarily_unavailable" },
        { status: 503, headers: { "retry-after": "3600" } },
      );
    }

    // Everything else is a 4xx about the account itself — unknown address,
    // already confirmed — and IS swallowed: reporting it would turn this route
    // into an account-existence oracle. Transport failures used to land here
    // too, which was the bug; they are caught above now.
    console.error("[auth/email] send failed:", error.message);
  }

  return NextResponse.json(GENERIC_OK, {
    headers: { "cache-control": "no-store" },
  });
}
