import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCleanedGainers, latestScrapedAt } from "@/lib/gainers";
import { tradingDaysAgoKey } from "@/lib/market-calendar";
import type { SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Counted in TRADING days, not calendar days: a calendar window swallows the
// weekend, so a free user visiting on a Sunday would see only 3–4 days with
// data and the number would drift by weekday. This always yields exactly 5.
const FREE_HISTORY_TRADING_DAYS = 5;

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

  // Free tier: the last 5 trading days. Pro: unlimited.
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier }>();
  const isPro = profile?.subscription_tier === "pro";
  // Both are YYYY-MM-DD, so a lexicographic compare is a date compare.
  const oldestFree = tradingDaysAgoKey(FREE_HISTORY_TRADING_DAYS);
  if (!isPro && date < oldestFree) {
    return NextResponse.json(
      { error: "upgrade_required", limitDays: FREE_HISTORY_TRADING_DAYS },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const rows = await getCleanedGainers(admin, date);
  return NextResponse.json(
    { date, asOf: latestScrapedAt(rows), gainers: rows },
    { headers: { "cache-control": "no-store" } },
  );
}
