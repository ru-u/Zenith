import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import type { GainerRow } from "./marketdata/types";
import { secondsUntilCloseET } from "./market-calendar";
import { siteUrl } from "./site";
import { DISCLAIMER_LINE, LEGAL_CONTACT_EMAIL } from "./legal";

// User-facing pre-close email — the daily "drop" nudge. Distinct from
// lib/alerts.ts (admin-only failure alerts): this fans out via the Resend batch
// endpoint. Recipients are Pro subscribers only (for now) — the recipient query
// filters on tier, so free users never receive it even with notify_preclose on.
// buildHtml keeps its free-tier branch dormant in case the email reopens to
// free accounts. The email is the actionable signal — DECA orders placed before
// the close fill at today's close, so the job is to pull students in while
// there's still time.

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 100; // Resend batch cap

type Recipient = {
  email: string;
  subscription_tier: "free" | "pro";
  unsubscribe_token: string;
};

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

function buildHtml(opts: {
  top: GainerRow[];
  mins: number;
  isPro: boolean;
  unsubUrl: string;
}): string {
  const { top, mins, isPro, unsubUrl } = opts;
  const site = siteUrl();
  const rows = top
    .map((g) => {
      const pct =
        g.changePercent != null ? `+${g.changePercent.toFixed(1)}%` : "";
      const name = g.companyName ? ` · ${esc(g.companyName)}` : "";
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(g.ticker)}<span style="color:#6b7280;font-weight:400">${name}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#059669;font-weight:600">${pct}</td>
      </tr>`;
    })
    .join("");

  const cta = isPro
    ? `<a href="${site}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">View today's 5 theses →</a>`
    : `<a href="${site}/upgrade" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Upgrade to read the theses →</a>`;

  const sub = isPro
    ? "Your short theses for today's top movers are ready."
    : "See why each is a short candidate with Zenith Pro theses.";

  const left =
    mins > 0
      ? `<strong>~${mins} min left</strong> to place orders that fill at <strong>today's close</strong>.`
      : `Today's close has passed — orders now fill at the next session's close.`;

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <h1 style="font-size:20px;margin:0 0 4px">Today's top short candidates are live</h1>
    <p style="color:#6b7280;margin:0 0 16px;font-size:14px">${left}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:20px">${rows}</table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px">${sub}</p>
    ${cta}
    <p style="color:#9ca3af;font-size:12px;margin-top:28px;line-height:1.5">
      ${DISCLAIMER_LINE} Zenith is a research aid for a simulated competition,
      not a recommendation to buy, sell, or short any real security.
      <a href="${site}/terms" style="color:#9ca3af">Terms</a> ·
      <a href="mailto:${LEGAL_CONTACT_EMAIL}" style="color:#9ca3af">${LEGAL_CONTACT_EMAIL}</a><br/>
      <a href="${unsubUrl}" style="color:#9ca3af">Unsubscribe from these alerts</a>
    </p>
  </div>`;
}

/**
 * Send the pre-close digest to opted-in Pro users. Once per (date) — the
 * system_alerts unique constraint is the dedup, so the read-path firing on many
 * concurrent requests near 3:30 sends a single batch. On a total send failure the
 * claim is released so a later trigger (or the EOD pass) can retry. Returns the
 * number of recipients sent.
 */
export async function sendPreCloseEmails(
  admin: SupabaseClient<Database>,
  dateKey: string,
  gainers: GainerRow[],
): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping pre-close emails");
    return 0;
  }

  // Claim the once-per-day slot atomically (same dedup pattern as maybeAlert).
  const { error: claimErr } = await admin
    .from("system_alerts")
    .insert({ date: dateKey, alert_type: "preclose_email", detail: "pre-close digest" });
  if (claimErr) {
    if (claimErr.code !== "23505") {
      console.error("[notify] dedup insert failed:", claimErr.message);
    }
    return 0; // already sent today, or insert failed — don't risk a flood
  }

  const releaseClaim = async () => {
    await admin
      .from("system_alerts")
      .delete()
      .eq("date", dateKey)
      .eq("alert_type", "preclose_email");
  };

  const { data } = await admin
    .from("profiles")
    .select("email, subscription_tier, unsubscribe_token")
    .eq("notify_preclose", true)
    .eq("subscription_tier", "pro") // Pro-only for now — see module comment
    .not("email", "is", null);

  const list = (data ?? []).filter((r): r is Recipient => !!r.email);
  if (list.length === 0) return 0;

  const top = gainers.slice(0, 5);
  const mins = (() => {
    const s = secondsUntilCloseET();
    return s == null ? 0 : Math.round(s / 60);
  })();
  // See lib/alerts.ts — never fall back to Resend's sandbox sender.
  const from = process.env.ALERT_EMAIL_FROM ?? `Zenith <${LEGAL_CONTACT_EMAIL}>`;
  const subject = `📈 Today's top short candidates${mins > 0 ? ` — ${mins} min to the close` : ""}`;

  let sent = 0;
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((r) => ({
      from,
      to: [r.email],
      subject,
      html: buildHtml({
        top,
        mins,
        isPro: r.subscription_tier === "pro",
        unsubUrl: `${siteUrl()}/api/unsubscribe?token=${r.unsubscribe_token}`,
      }),
    }));
    try {
      const res = await fetch(RESEND_BATCH_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error("[notify] resend batch", res.status, await res.text().catch(() => ""));
      } else {
        sent += chunk.length;
      }
    } catch (e) {
      console.error("[notify] batch send failed:", (e as Error)?.message);
    }
  }

  // Total failure → release the slot so a later trigger can retry today.
  if (sent === 0) await releaseClaim();
  return sent;
}
