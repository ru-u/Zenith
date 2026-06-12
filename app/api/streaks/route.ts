import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public: active streaks (>= 2 consecutive days), top 50 by length.
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ticker_streaks")
    .select("*")
    .gte("streak_count", 2)
    .order("streak_count", { ascending: false })
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
