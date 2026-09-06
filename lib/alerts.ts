import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { LEGAL_CONTACT_EMAIL } from "./legal";

// Critical-failure alerting for the scraper pipeline. Every other failure path
// degrades gracefully (serve stale cache, null thesis) — these are the cases
// where the app is silently broken and a human needs to know.

export type AlertType =
  | "provider_failed" // both retries exhausted on a trading day — no fresh data
  | "eod_not_finalized" // no is_final row locked for a trading day
  // The partial-finalize case, which eod_not_finalized cannot see: its check is
  // `rows.some(r => r.is_final)`, so a day where MOST rows finalized and a few
  // kept stale intraday values passes clean. That is how AIFU sat in the
  // 2026-09-04 board at +5.603% on a day it closed -18.58%. Removing the thesis
  // pin (lib/gainers.ts) should make this unreachable — which is the point of
  // alerting on it.
  | "partial_finalize" // a finalized day still has non-final rows
  | "ai_all_failed" // 0 theses generated for a finalized day with gainers
  // Distinct from ai_all_failed, which only fires at ZERO rows. This one is the
  // opposite shape of problem: the run succeeded, every row was written, and the
  // prose quietly came from the template while AI_PROSE_MODE=model had /engine
  // telling users a model wrote it. Nothing else can detect that.
  | "model_prose_degraded" // most/all model prose calls fell back to the template
  | "symbol_integrity" // scanner rows we couldn't safely qualify (wrong venue / malformed ticker)
  // The two halves of the session gate in persistGainers, split because the
  // fixes have nothing in common. Neither fires during the normal 9:30-9:47
  // warm-up — that mismatch is expected and the read path stays silent through
  // it; these mean the gate is in a state a human has to look at.
  | "feed_not_rolled" // provider still serving a previous session long past the open (or at a cron hour)
  | "feed_session_unknown" // the scanner's `time` column vanished — the gate is fail-open and blind
  | "security_spike" // failed logins / authz denials / bad cron auth spiking from one IP
  | "prune_anomaly" // unconfirmed-account prune found an implausible number of rows
  | "calibration_drift" // a scoring constant now sits outside its realized confidence interval
  // The email ceilings, kept apart on purpose: one is a free dashboard toggle,
  // one is a billing decision, and one is neither — and "email failed" would
  // leave you guessing which at the moment guessing is most expensive. The
  // numbers themselves live in lib/emailBudget.ts (Supabase 50/HOUR, Resend
  // 100/DAY — different units, do not conflate).
  | "auth_email_rate_limited" // Supabase's hourly auth-email cap (50/hr) refused a send
  | "auth_email_send_failed" // the send failed BENEATH Supabase (SMTP/provider 5xx)
  | "resend_quota_exhausted"; // Resend's daily account quota (100/day free) refused a send

/**
 * Send one ops email (alerts, feedback notifications) to ALERT_EMAIL_TO via
 * the Resend REST API (no SDK dependency). No-op unless Resend is configured.
 */
export async function sendOpsEmail(subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  // Default to the verified zenithscreener.com sender, NOT Resend's
  // `onboarding@resend.dev` sandbox — that only delivers to the Resend account
  // owner, and an unset ALERT_EMAIL_FROM on Railway silently swallowed the
  // pre-close drop for weeks before it was caught.
  const from = process.env.ALERT_EMAIL_FROM ?? `Zenith Alerts <${LEGAL_CONTACT_EMAIL}>`;
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
      const detail = await res.text().catch(() => "");
      console.error("[alerts] resend returned", res.status, detail);
      // Deliberately logged, NOT escalated through maybeAlert: this function is
      // what maybeAlert uses to send, so alerting from here about a send
      // failure would recurse — and there is no point emailing someone to tell
      // them email is broken. A structured line is greppable and does not lie.
      if (res.status === 429 || /quota|limit/i.test(detail)) {
        console.error(
          JSON.stringify({
            kind: "email_quota",
            source: "resend",
            status: res.status,
            at: new Date().toISOString(),
            detail: "Resend refused a send — daily account quota likely exhausted",
          }),
        );
      }
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
