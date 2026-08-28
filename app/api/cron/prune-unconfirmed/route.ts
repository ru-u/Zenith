import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cronAuth";
import { pruneUnconfirmedUsers, PRUNE_AFTER_HOURS } from "@/lib/pruneUnconfirmed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Deletes accounts that never confirmed their email. Driven hourly by the
// in-process scheduler (instrumentation.ts); this endpoint exists so it can
// also be triggered by hand, which is how the dry run below is meant to be used.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://zenithscreener.com/api/cron/prune-unconfirmed?dryRun=1"
//
// Unlike the other two cron routes this does NOT skip non-trading days: people
// sign up on weekends, and an account created Friday evening should not survive
// until Monday just because the market was shut.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req, "prune-unconfirmed");
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const admin = createAdminClient();
  try {
    const result = await pruneUnconfirmedUsers(admin, { dryRun });
    return NextResponse.json({
      ok: true,
      dryRun,
      olderThanHours: PRUNE_AFTER_HOURS,
      ...result,
    });
  } catch (err) {
    const message = (err as Error)?.message ?? "prune failed";
    console.error("[cron/prune-unconfirmed]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
