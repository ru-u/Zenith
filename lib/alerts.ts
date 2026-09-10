import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { LEGAL_CONTACT_EMAIL } from "./legal";

// Critical-failure alerting for the scraper pipeline. Every other failure path
// degrades gracefully (serve stale cache, null thesis) — these are the cases
// where the app is silently broken and a human needs to know.

export type AlertType =
  | "provider_failed" // both retries exhausted on a trading day — no fresh data
  // The pre-close drop threw for a reason that ISN'T the provider. Split off
  // from provider_failed because maybeAlert dedups once per (date, type): on
  // 2026-09-09 a Supabase 504 inside the drop claimed the provider's slot at
  // 15:30:06, which would have silently swallowed a genuine TradingView failure
  // from the read path or run-eod for the rest of that day. It is also the
  // honest label — the drop's catch wraps DB reads, persist, thesis generation
  // and email, not just the fetch.
  | "preclose_failed" // the pre-close drop failed, and not at the provider
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
  // The board came back far shorter than the filters should ever leave it. The
  // previous-close eligibility check derives the prior close by dividing by the
  // scanner's `change` column, so a contract change there turns every row
  // ineligible and guts the board without any request failing.
  | "board_short" // too few rows survived local filtering
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
  | "resend_quota_exhausted" // Resend's daily account quota (100/day free) refused a send
  // The pre-close drop was withheld because siteUrl() came back as loopback, so
  // every link in it would have pointed at the container. Distinct from the two
  // send-failure alerts above: nothing refused us and nothing was attempted —
  // we declined to mail a dead link. Only reachable from a production build,
  // and only fixable by a REBUILD, since NEXT_PUBLIC_* is inlined at build time.
  | "site_url_unset";

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

/**
 * One scheduler tick. instrumentation.ts pings /api/cron/pre-close every 5
 * minutes across the whole 30-minute pre-close window, and any page load in
 * that window fires runPreCloseProcessing independently via after()
 * (app/api/gainers/route.ts) — so a failure with more than one tick of runway
 * left has several chances behind it and is not yet news.
 */
const LAST_TICK_SECONDS = 5 * 60;

export interface PreCloseFailure {
  /** Whether the proximate throw was a ProviderError (i.e. actually the feed). */
  isProviderFault: boolean;
  /** Theses stored for the day, read back AFTER the drop attempt. */
  thesisCount: number;
  /** secondsUntilCloseET() — null past the close or on a non-trading day. */
  secondsUntilClose: number | null;
}

export interface PreCloseVerdict {
  alert: boolean;
  type: AlertType;
  /** Human-readable justification — goes in the email body or the suppressed log line. */
  reason: string;
}

/**
 * Whether a failed pre-close tick is worth an ops email, and under which type.
 *
 * The old catch alerted on the FIRST failed tick with a hardcoded body claiming
 * the provider had failed and that the drop produced nothing. On 2026-09-09
 * both halves were false: a Supabase 504 (message `Gateway Timeout` — a shape
 * no provider error can take, since those are all "scanner returned <status>"
 * or "fetch failed: <msg>") threw at 15:30:06, and the read path had all five
 * theses stored and the Pro email sent by 15:30:45, 39 seconds later.
 *
 * Deferring to the last tick costs ~25 minutes of notice on a genuinely dead
 * drop. That buys nothing — the drop email lands at the same moment either way,
 * and there is no manual recovery anyone performs in those 25 minutes — and it
 * buys back an alert that can be believed.
 *
 * Pure on purpose: .env.local points at the PRODUCTION database and there is no
 * test framework in this repo, so this is the half that can be exercised
 * directly without writing a row someone then has to go delete.
 */
export function classifyPreCloseFailure(f: PreCloseFailure): PreCloseVerdict {
  const type: AlertType = f.isProviderFault ? "provider_failed" : "preclose_failed";

  if (f.thesisCount > 0) {
    return {
      alert: false,
      type,
      reason: `${f.thesisCount} thesis row(s) already stored for the day — the drop landed`,
    };
  }
  // null means past the close or not a trading day: no further tick is coming,
  // so this must read as "alert", never as "stay quiet".
  if (f.secondsUntilClose == null) {
    return { alert: true, type, reason: "no ticks left — past the close" };
  }
  if (f.secondsUntilClose <= LAST_TICK_SECONDS) {
    return {
      alert: true,
      type,
      reason: `${f.secondsUntilClose}s to the close — this was the last tick`,
    };
  }
  return {
    alert: false,
    type,
    reason: `${f.secondsUntilClose}s to the close — later ticks can still recover it`,
  };
}
