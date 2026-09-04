import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cronAuth";
import { checkCalibration, formatCalibrationBody } from "@/lib/quant/calibration";
import { maybeAlert } from "@/lib/alerts";
import { formatDateKey } from "@/lib/market-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Monthly calibration drift check. Asks one narrow question — has any hand-set
// constant in score.ts drifted far enough that realized outcomes now REJECT it
// (predicted value outside the Wilson interval)? — and emails only if so.
//
// Deliberately not a trading-day job: it reads accumulated history, so the day
// it runs is irrelevant. Driven monthly by the in-process scheduler; this
// endpoint exists so it can also be run by hand.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://zenithscreener.com/api/cron/calibration"
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req, "calibration");
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();
  const result = await checkCalibration(admin);
  if (!result) {
    return NextResponse.json({ ok: true, skipped: "not enough recorded outcomes yet" });
  }

  if (result.flagged.length > 0) {
    // Deduped on (date, type) like every other alert, so a hand-run on the same
    // day as the scheduled one can't double-send.
    await maybeAlert(admin, {
      date: formatDateKey(new Date()),
      type: "calibration_drift",
      subject: `Zenith: ${result.flagged.length} scoring constant(s) outside their realized CI`,
      body: formatCalibrationBody(result),
    });
  }

  return NextResponse.json({
    ok: true,
    total: result.total,
    skill: Number(result.skill.toFixed(4)),
    flagged: result.flagged.map((r) => ({
      catalyst_type: r.catalyst_type,
      n: r.n,
      predicted: Number(r.predicted.toFixed(1)),
      realized: Number(r.realized.toFixed(1)),
      ci: [Number(r.ci_low.toFixed(1)), Number(r.ci_high.toFixed(1))],
    })),
  });
}
