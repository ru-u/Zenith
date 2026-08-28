import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionTier } from "@/lib/supabase/types";
import { checkLimit } from "@/lib/ratelimit";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Pro-only. Defense-in-depth: explicit tier check here AND RLS at the DB layer.
export async function GET(req: Request) {
  const ip = clientIp(req);
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  // This is the paywalled product. Rate limit it so a Pro account can't be used
  // as a scraping tap to mirror the theses somewhere free.
  const limited = checkLimit(req, {
    route: "ai-analysis",
    limit: 60,
    windowSeconds: 300,
    userId: user.id,
  });
  if (limited) {
    logSecurityEvent("ratelimit.exceeded", {
      ip,
      userId: user.id,
      route: "GET /api/ai-analysis",
    });
    return limited;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier }>();

  if (profile?.subscription_tier !== "pro") {
    // A free user probing the Pro endpoint is usually just the UI; a lot of it
    // from one IP is someone looking for a gap between this check and RLS.
    logSecurityEvent("authz.tier_denied", {
      ip,
      userId: user.id,
      route: "GET /api/ai-analysis",
      detail: `date=${date}`,
    });
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_analyses")
    .select("*")
    .eq("date", date);

  return NextResponse.json(
    { analyses: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
