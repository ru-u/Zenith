import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsEmail } from "@/lib/alerts";
import { checkLimit } from "@/lib/ratelimit";
import { requireSameOrigin } from "@/lib/csrf";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE = 2000;

// Spam guard: per user, per type, over a rolling 24h window. A rolling window
// (vs. calendar day) can't be gamed by submitting just before/after midnight.
const DAILY_LIMIT = 2;

// Bug reports / feature suggestions from Settings → Support. Auth required
// (keeps drive-by spam out); stored via the service role since the feedback
// table has no public policies.
export async function POST(req: Request) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  // The DAILY_LIMIT below is the real spam control, but it costs a count query
  // to evaluate. This stops a loop from running that query thousands of times
  // per second just to be told "no", and it is keyed by IP as well as user —
  // signups are free, so a per-user cap alone is a cap an attacker can mint
  // more of.
  const ip = clientIp(req);
  for (const [route, id, limit] of [
    ["feedback:user", user.id, 10],
    ["feedback:ip", undefined, 30],
  ] as const) {
    const limited = checkLimit(req, {
      route,
      limit,
      windowSeconds: 3600,
      userId: id,
    });
    if (limited) {
      logSecurityEvent("ratelimit.exceeded", {
        ip,
        userId: user.id,
        route: "POST /api/feedback",
      });
      return limited;
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const rawType = (body as { type?: unknown })?.type;
  const rawMessage = (body as { message?: unknown })?.message;

  const type = rawType === "bug" || rawType === "feature" ? rawType : null;
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (!type || !message) {
    logSecurityEvent("input.rejected", {
      ip,
      userId: user.id,
      route: "POST /api/feedback",
      detail: "bad type or empty message",
    });
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: `message too long (max ${MAX_MESSAGE} chars)` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("feedback")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("type", type)
    .gte("created_at", since);
  if (countError) {
    console.error("[feedback] rate-limit check failed:", countError.message);
    return NextResponse.json({ error: "could not save feedback" }, { status: 500 });
  }
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: `You've hit the limit of ${DAILY_LIMIT} ${
          type === "bug" ? "bug reports" : "feature suggestions"
        } per day. Try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  const { error } = await admin.from("feedback").insert({
    user_id: user.id,
    email: user.email ?? null,
    type,
    message,
  });
  if (error) {
    console.error("[feedback] insert failed:", error.message);
    return NextResponse.json({ error: "could not save feedback" }, { status: 500 });
  }

  // Heads-up email after the response — losing it is fine, the row is saved.
  after(() =>
    sendOpsEmail(
      `Zenith ${type === "bug" ? "bug report" : "feature request"} from ${user.email ?? user.id}`,
      message,
    ),
  );

  return NextResponse.json({ ok: true });
}
