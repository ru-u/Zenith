import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

// Critical-failure alerting for the scraper pipeline. Every other failure path
// degrades gracefully (serve stale cache, null thesis) — these are the cases
// where the app is silently broken and a human needs to know.

export type AlertType =
  | "provider_failed" // both retries exhausted on a trading day — no fresh data
  | "eod_not_finalized" // no is_final row locked for a trading day
  | "ai_all_failed"; // 0 theses generated for a finalized day with gainers

/**
 * Send one ops email (alerts, feedback notifications) to ALERT_EMAIL_TO via
 * the Resend REST API (no SDK dependency). No-op unless Resend is configured.
 */
export async function sendOpsEmail(subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM ?? "Zenith Alerts <onboarding@resend.dev>";
  if (!apiKey || !to) {
    console.warn(
      "[alerts] RESEND_API_KEY / ALERT_EMAIL_TO not set — skipping email:",
      subject,
    );
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
    });
    if (!res.ok) {
      console.error(
        "[alerts] resend returned",
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error("[alerts] email send failed:", (e as Error)?.message);
    return false;
  }
}

/**
 * Fire a critical alert at most once per (date, type). The `system_alerts`
 * unique constraint IS the dedup: only the first caller to insert the row sends
 * the email, so the on-read path hammering a blocked provider emails once — not
 * once per page load. Never throws; alerting must never break the pipeline.
 */
export async function maybeAlert(
  admin: SupabaseClient<Database>,
  opts: { date: string; type: AlertType; subject: string; body: string },
): Promise<void> {
  const { date, type, subject, body } = opts;
  try {
    const { error } = await admin
      .from("system_alerts")
      .insert({ date, alert_type: type, detail: subject });
    if (error) {
      // 23505 = unique violation = already alerted today for this type. Any other
      // error (e.g. migration not run) we log but still don't email, to be safe
      // against floods.
      if (error.code !== "23505") {
        console.error("[alerts] dedup insert failed:", error.message);
      }
      return;
    }
    await sendOpsEmail(subject, body);
  } catch (e) {
    console.error("[alerts] maybeAlert error:", (e as Error)?.message);
  }
}
