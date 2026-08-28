import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Account-gated: active streaks (>= 2 consecutive days), top 50 by length.
// Signed-out visitors get an empty list (200, not 401 — useStreaks throws on
// !ok and TanStack Query would retry-spam an endpoint that can never succeed
// for them; empty just means no badges render).
// "Active" = last_seen_date equals the table's most recent date. Broken streaks
// are never deleted (updateStreaks only touches the day's tickers), so without
// this filter stale rows accumulate past the limit and push live streaks out.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { streaks: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // Two DB round-trips per call; cheap, but not free at volume.
  const limited = checkLimit(req, {
    route: "streaks",
    limit: 120,
    windowSeconds: 300,
    userId: user.id,
  });
  if (limited) return limited;

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
