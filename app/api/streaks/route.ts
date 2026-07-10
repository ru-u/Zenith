import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public: active streaks (>= 2 consecutive days), top 50 by length.
// "Active" = last_seen_date equals the table's most recent date. Broken streaks
// are never deleted (updateStreaks only touches the day's tickers), so without
// this filter stale rows accumulate past the limit and push live streaks out.
export async function GET() {
  const admin = createAdminClient();

  const { data: latest } = await admin
    .from("ticker_streaks")
    .select("last_seen_date")
    .order("last_seen_date", { ascending: false })
    .limit(1)
    .maybeSingle<{ last_seen_date: string }>();
  if (!latest) {
    return NextResponse.json(
      { streaks: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data, error } = await admin
    .from("ticker_streaks")
    .select("*")
    .eq("last_seen_date", latest.last_seen_date)
    .gte("streak_count", 2)
    .order("streak_count", { ascending: false })
    .order("ticker", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[/api/streaks]", error.message);
    return NextResponse.json({ streaks: [] }, { status: 200 });
  }

  return NextResponse.json(
    { streaks: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
