import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayET } from "@/lib/market-calendar";
import { TICKER_RE } from "@/lib/marketdata/normalize";
import { getTickerHistory } from "@/lib/tickerHistory";
import type { SubscriptionTier } from "@/lib/supabase/types";
import { checkLimit } from "@/lib/ratelimit";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Every past session a ticker made the board. PRO ONLY — the per-session list
 * is the archive Pro sells ("Unlimited history"), which is exactly why
 * `/stock/[ticker]` publishes aggregates instead. See lib/tickerHistory.ts.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  // The same shape persistGainers enforces, so nothing that can't be on the
  // board ever reaches a query.
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "invalid ticker" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  // Tighter than the per-date route's 120/5min: each lookup pages up to two
  // sessions of rows per appearance, and walking tickers is the other way to
  // bulk-export the archive.
  const limited = checkLimit(req, {
    route: "gainers:ticker",
    limit: 40,
    windowSeconds: 300,
    userId: user.id,
  });
  if (limited) {
    logSecurityEvent("ratelimit.exceeded", {
      ip: clientIp(req),
      userId: user.id,
      route: "GET /api/gainers/ticker/[ticker]",
    });
    return limited;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier }>();
  if (profile?.subscription_tier !== "pro") {
    logSecurityEvent("authz.tier_denied", {
      ip: clientIp(req),
      userId: user.id,
      route: "GET /api/gainers/ticker/[ticker]",
      detail: `ticker=${ticker}`,
    });
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 });
  }

  const history = await getTickerHistory(
    createAdminClient(),
    ticker,
    getTodayET(),
  );
  return NextResponse.json(history, {
    headers: { "cache-control": "no-store" },
  });
}
