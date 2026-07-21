import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Matches favorites_ticker_format_check in supabase/schema.sql.
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MAX_FAVORITES = 50;

// Per-user starred tickers (free-account feature). Writes go through the service
// role since favorites has no insert/delete policy; the GET reads the caller's
// own rows (defense-in-depth: the select-own policy would allow the anon client
// to read them too, but the admin read keeps this uniform with /api/streaks).

// GET — the current user's favorites.
// Guest → { favorites: null } (200, not 401): the null sentinel lets the client
// tell "signed out" apart from "signed in, zero favorites" straight from the
// shared query cache, so the per-row star never has to fetch auth itself. 200
// (like /api/streaks) avoids TanStack Query retry-spamming an endpoint that can
// never succeed for a guest.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { favorites: null },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("favorites")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[/api/favorites]", error.message);
    return NextResponse.json({ favorites: [] }, { status: 200 });
  }

  return NextResponse.json(
    { favorites: (data ?? []).map((r) => r.ticker) },
    { headers: { "cache-control": "no-store" } },
  );
}

// POST { ticker } — add a favorite (idempotent).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  let body: { ticker?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "invalid ticker" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Soft cap. Count-then-insert isn't atomic, but a 50-row limit doesn't need
  // to be — the worst case is a user landing on 51 via a race, which is harmless.
  const { count, error: countError } = await admin
    .from("favorites")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    console.error("[/api/favorites] count failed:", countError.message);
    return NextResponse.json({ error: "could not save favorite" }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_FAVORITES) {
    return NextResponse.json(
      { error: `Favorites are capped at ${MAX_FAVORITES} tickers. Remove one to add another.` },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("favorites")
    .upsert({ user_id: user.id, ticker }, { onConflict: "user_id,ticker", ignoreDuplicates: true });
  if (error) {
    console.error("[/api/favorites] insert failed:", error.message);
    return NextResponse.json({ error: "could not save favorite" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE ?ticker=X — remove a favorite (idempotent). Ticker rides in the query
// string, not a body: DELETE request bodies are dropped by some proxies.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth required" }, { status: 401 });

  const ticker = (new URL(req.url).searchParams.get("ticker") ?? "")
    .trim()
    .toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "invalid ticker" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("favorites")
    .delete()
    .match({ user_id: user.id, ticker });
  if (error) {
    console.error("[/api/favorites] delete failed:", error.message);
    return NextResponse.json({ error: "could not remove favorite" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
