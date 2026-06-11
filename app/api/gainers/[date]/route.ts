import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedGainers, latestScrapedAt } from "@/lib/gainers";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FREE_HISTORY_DAYS = 5;

function daysAgo(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  // History requires an account.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  // Free tier: last 5 days only. Pro: unlimited.
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier }>();
  const isPro = profile?.subscription_tier === "pro";
  if (!isPro && daysAgo(date) > FREE_HISTORY_DAYS) {
    return NextResponse.json(
      { error: "upgrade_required", limitDays: FREE_HISTORY_DAYS },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const rows = await getCachedGainers(admin, date);
  return NextResponse.json(
    { date, asOf: latestScrapedAt(rows), gainers: rows },
    { headers: { "cache-control": "no-store" } },
  );
}
