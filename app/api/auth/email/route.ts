import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLimit } from "@/lib/ratelimit";
import { requireSameOrigin } from "@/lib/csrf";
import { clientIp, logSecurityEvent } from "@/lib/seclog";
import { maybeAlert } from "@/lib/alerts";
import { getTodayET } from "@/lib/market-calendar";

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
// Budget context (see CLAUDE.md): Supabase caps auth email at 50/hour, and
// Resend's account quota caps EVERYTHING — auth email plus the pre-close drop —
// at 100/day on the free tier. Signups bypass this route entirely
// (SignupForm calls supabase.auth.signUp from the browser), so the limits below
// deliberately claim only part of the hourly budget and leave the rest for them.

const MAX_EMAIL_LENGTH = 254; // RFC 5321
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per address: a single mailbox cannot be used to drain the budget.
const PER_ADDRESS_LIMIT = 3;
// Per IP: stops one client cycling addresses to get around the above.
const PER_IP_LIMIT = 5;
// Across the whole route: the one that actually protects signups. Half of
// Supabase's 50/hr, so resends can never crowd out people creating accounts.
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

  if (!type || !email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
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
    { route: "auth-email:address", limit: PER_ADDRESS_LIMIT, key: addressKey(email) },
    { route: "auth-email:ip", limit: PER_IP_LIMIT, key: undefined },
    { route: "auth-email:global", limit: GLOBAL_LIMIT, key: "all" },
  ];
  for (const { route, limit, key } of limits) {
    const limited = checkLimit(req, { route, limit, windowSeconds: WINDOW_SECONDS, key });
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
    // Supabase's own hourly ceiling. Distinct from a Resend quota failure
    // (alerts.ts/notify.ts raise that one) because the fixes differ: this is a
    // free dashboard toggle, that one is a billing decision.
    const rateLimited =
      error.status === 429 || error.code === "over_email_send_rate_limit";

    if (rateLimited) {
      console.error("[auth/email] Supabase refused — hourly cap reached");
      await maybeAlert(createAdminClient(), {
        date: getTodayET(),
        type: "auth_email_rate_limited",
        subject: "Zenith: Supabase auth-email hourly cap reached",
        body: [
          "Supabase refused an auth email because the hourly send limit is",
          "exhausted. Anyone signing up right now is NOT receiving their",
          "confirmation email, and will not be able to sign in.",
          "",
          "Raise it: Supabase -> Authentication -> Rate Limits ->",
          "'Rate limit for sending emails'.",
          "",
          "If it was raised recently, the ceiling underneath is Resend's daily",
          "account quota (100/day on the free tier), shared with the pre-close",
          "drop. Check the Resend dashboard before raising this further.",
          "",
          "One alert per day; further refusals today will not re-send this.",
        ].join("\n"),
      });
      // Safe to be specific: the cap is global, so saying so reveals nothing
      // about whether this particular address has an account.
      return NextResponse.json(
        { error: "email_temporarily_unavailable" },
        { status: 503, headers: { "retry-after": "3600" } },
      );
    }

    // Everything else — unknown address, already-confirmed account, transport
    // failure — is swallowed. Reporting it would turn this route into an
    // account-existence oracle.
    console.error("[auth/email] send failed:", error.message);
  }

  return NextResponse.json(GENERIC_OK, {
    headers: { "cache-control": "no-store" },
  });
}
