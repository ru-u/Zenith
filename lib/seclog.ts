import { createAdminClient } from "./supabase/admin";
import { maybeAlert } from "./alerts";
import { clientIp, rateLimit } from "./ratelimit";
import { getTodayET } from "./market-calendar";

// Structured security logging + spike alerting.
//
// The point is not "log more" — it's that the three events worth waking up for
// (someone guessing passwords, someone probing another user's data, someone
// hammering a metered endpoint) currently look exactly like normal traffic in
// Railway's log stream. Each event goes out as a single-line JSON object so it
// can be grepped or shipped to a log drain without a parser, and the ones that
// indicate an attack in progress escalate to an email once per day.

export type SecurityEvent =
  | "auth.failed_login" // bad password / rejected credentials
  | "auth.rate_limited" // limiter tripped on an auth route
  | "authz.denied" // signed in, but not allowed to have this
  | "authz.tier_denied" // free user reaching for Pro-only data
  | "cron.unauthorized" // bad or missing CRON_SECRET
  | "webhook.bad_signature" // Stripe signature verification failed
  | "input.rejected" // payload failed server-side validation
  | "ratelimit.exceeded"; // limiter tripped on a metered route

type Context = {
  ip?: string;
  userId?: string;
  route?: string;
  email?: string;
  detail?: string;
};

// Spike thresholds: how many of an event from ONE source before it stops being
// noise. Deliberately generous — a real user fat-fingering a password a few
// times should never page anyone.
const SPIKE: Partial<Record<SecurityEvent, { count: number; windowSeconds: number }>> = {
  "auth.failed_login": { count: 20, windowSeconds: 300 }, // 20 in 5 min from one IP
  "authz.denied": { count: 30, windowSeconds: 300 },
  "cron.unauthorized": { count: 5, windowSeconds: 600 },
  "webhook.bad_signature": { count: 5, windowSeconds: 600 },
};

/**
 * Mask an email for logs: keeps enough to correlate a report with a record,
 * without turning the log stream into a list of your users' addresses.
 */
function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [local, domain] = email.split("@");
  if (!domain) return "invalid";
  return `${(local ?? "").slice(0, 2)}***@${domain}`;
}

/**
 * Record a security event. Never throws and never blocks the response path —
 * a logging failure must not turn into a request failure.
 */
export function logSecurityEvent(event: SecurityEvent, ctx: Context = {}): void {
  try {
    console.warn(
      JSON.stringify({
        kind: "security",
        event,
        at: new Date().toISOString(),
        ip: ctx.ip,
        userId: ctx.userId,
        route: ctx.route,
        email: maskEmail(ctx.email),
        detail: ctx.detail,
      }),
    );

    const spike = SPIKE[event];
    if (!spike || !ctx.ip) return;

    // Reuse the sliding-window counter as the spike detector: the first call
    // that fails the budget is the one that crossed the threshold.
    const { success } = rateLimit(
      `sec:${event}:${ctx.ip}`,
      spike.count,
      spike.windowSeconds,
    );
    if (success) return;

    // Escalate. Fire-and-forget: maybeAlert swallows its own errors and dedups
    // to one email per (day, type), so a sustained attack sends one message.
    void maybeAlert(createAdminClient(), {
      date: getTodayET(),
      type: "security_spike",
      subject: `Zenith: security spike — ${event}`,
      body: [
        `Event: ${event}`,
        `Source IP: ${ctx.ip}`,
        `Threshold: ${spike.count} in ${spike.windowSeconds / 60} min`,
        ctx.route ? `Route: ${ctx.route}` : null,
        ctx.userId ? `User: ${ctx.userId}` : null,
        ctx.detail ? `Detail: ${ctx.detail}` : null,
        "",
        "Further events of this type today will NOT re-alert (one email per",
        "day per type). Check the Railway logs for lines with kind=\"security\".",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch {
    // Logging must never break a request.
  }
}

export { clientIp };
