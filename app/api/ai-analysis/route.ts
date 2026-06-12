import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Pro-only. Defense-in-depth: explicit tier check here AND RLS at the DB layer.
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier }>();

  if (profile?.subscription_tier !== "pro") {
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
