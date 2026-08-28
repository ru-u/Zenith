import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLimit } from "@/lib/ratelimit";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One-click unsubscribe for pre-close emails. The per-user `unsubscribe_token`
// (unguessable) is the authorization, so this is safe to hit unauthenticated
// from an email client.
//
// GET RENDERS, POST MUTATES — and that split is not pedantry. This route used
// to flip the flag straight from the GET, which meant anything that follows
// links in a mailbox unsubscribed the user without them ever clicking:
// Outlook SafeLinks, corporate mail scanners, and link-preview fetchers all
// pre-open URLs found in mail. Subscribers would silently stop receiving the
// drop and there'd be nothing in the logs to distinguish it from a real click.
// GET is defined as safe in HTTP for exactly this reason.
//
// A scanner won't POST, and browsers won't cross-site POST a form to us with
// any credential that matters (there is none — the token in the body is the
// whole authorization), so the confirm button is both scanner-proof and
// usable without an account.

function page(body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Zenith</title><div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#111827">${body}</div>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        // The token rides in the query string. The global
        // Referrer-Policy: strict-origin-when-cross-origin in next.config.ts
        // already strips path+query from any cross-origin Referer, so it is
        // NOT re-set here — a second, conflicting Referrer-Policy on the same
        // response is worse than one correct one.
        ...extraHeaders,
      },
    },
  );
}

// These render for a human in a browser, so they carry a readable page rather
// than a JSON error — but the STATUS still has to be truthful. A 429 served as
// 200 is invisible to monitoring and to any client that retries on status.
const message = (msg: string, status = 200, extraHeaders?: Record<string, string>) =>
  page(
    `<h1 style="font-size:20px;margin-bottom:8px">${msg}</h1><p><a href="/" style="color:#0891b2">Back to Zenith</a></p>`,
    status,
    extraHeaders,
  );

// GET — confirmation page only. Never writes.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !UUID_RE.test(token)) return message("Invalid unsubscribe link.");

  // The token is echoed into a hidden input, so it has to be escaped even
  // though the regex above already constrains it to hex and dashes. Two
  // independent reasons to be safe is the point.
  const safe = token.replace(/[^0-9a-fA-F-]/g, "");

  return page(
    `<h1 style="font-size:20px;margin-bottom:8px">Unsubscribe from pre-close alerts?</h1>
     <p style="color:#4b5563;font-size:14px;margin-bottom:20px">You'll stop receiving the daily email that lands about 30 minutes before the close. Your account stays active.</p>
     <form method="post">
       <input type="hidden" name="token" value="${safe}">
       <button type="submit" style="background:#0891b2;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer">Yes, unsubscribe me</button>
     </form>
     <p style="margin-top:16px"><a href="/" style="color:#6b7280;font-size:13px">No, keep them coming</a></p>`,
  );
}

// POST — performs the unsubscribe. Accepts the token from a form post (the
// confirm button) or from the query string, which is what mail providers send
// for RFC 8058 one-click (`List-Unsubscribe-Post`).
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token");

  if (!token) {
    try {
      const form = await req.formData();
      const field = form.get("token");
      if (typeof field === "string") token = field;
    } catch {
      // Not form-encoded — fall through to the invalid-token response.
    }
  }

  if (!token || !UUID_RE.test(token)) return message("Invalid unsubscribe link.");

  // Unauthenticated and token-guessing-shaped. The token is a v4 UUID so
  // guessing is hopeless, but there's no reason to serve the attempts.
  const limited = checkLimit(req, {
    route: "unsubscribe",
    limit: 20,
    windowSeconds: 600,
  });
  if (limited) {
    logSecurityEvent("ratelimit.exceeded", {
      ip: clientIp(req),
      route: "POST /api/unsubscribe",
    });
    // Carry the limiter's Retry-After onto the HTML response — the JSON body
    // checkLimit built is discarded here, but the header is still the useful part.
    return message("Too many attempts. Please try again in a few minutes.", 429, {
      "retry-after": limited.headers.get("retry-after") ?? "60",
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ notify_preclose: false })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();

  if (error || !data) return message("This unsubscribe link is no longer valid.");
  return message("You've been unsubscribed from pre-close alerts.");
}
