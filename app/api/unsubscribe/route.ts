import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One-click unsubscribe for pre-close emails. The per-user `unsubscribe_token`
// (unguessable) is the authorization, so this is safe to hit unauthenticated
// from an email client. Flips `profiles.notify_preclose` to false.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");

  const page = (msg: string) =>
    new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zenith</title><div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#111827"><h1 style="font-size:20px;margin-bottom:8px">${msg}</h1><p><a href="/" style="color:#0891b2">Back to Zenith</a></p></div>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  if (!token || !UUID_RE.test(token)) return page("Invalid unsubscribe link.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ notify_preclose: false })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();

  if (error || !data) return page("This unsubscribe link is no longer valid.");
  return page("You've been unsubscribed from pre-close alerts.");
}
