import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { checkLimit } from "@/lib/ratelimit";
import { requireSameOrigin } from "@/lib/csrf";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Opens the Stripe Billing Portal so a Pro subscriber can update their card,
// view invoices, or cancel. Requires an existing Stripe customer (created at
// checkout); free users never reach this — the UI shows Upgrade instead.
export async function POST(req: Request) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const ip = clientIp(req);
  const limited = checkLimit(req, {
    route: "stripe:portal",
    limit: 10,
    windowSeconds: 600,
    userId: user.id,
  });
  if (limited) {
    logSecurityEvent("ratelimit.exceeded", {
      ip,
      userId: user.id,
      route: "POST /api/stripe/create-portal",
    });
    return limited;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const appUrl = siteUrl();

  try {
    // Confirm with STRIPE that this customer belongs to this user before
    // opening a portal session against it.
    //
    // The billing portal exposes invoices, the card on file, the billing
    // address, and the cancel button — so `stripe_customer_id` is effectively a
    // capability, and this route used to trust whatever value sat in the row.
    // Until the RLS fix in supabase/migrate.sql, a signed-in user could write
    // ANY column of their own profile from the browser, so they could paste a
    // stranger's customer id here and walk straight into that person's billing.
    // The policy is gone, but a route that hands out a portal session must not
    // depend on a policy elsewhere staying correct: Stripe is the authority on
    // who owns a customer, so ask Stripe.
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
    const ownerId =
      "deleted" in customer && customer.deleted
        ? null
        : (customer as Stripe.Customer).metadata?.supabase_user_id;

    if (ownerId !== user.id) {
      logSecurityEvent("authz.denied", {
        ip,
        userId: user.id,
        route: "POST /api/stripe/create-portal",
        detail: `customer ${profile.stripe_customer_id} maps to ${ownerId ?? "no/deleted user"}`,
      });
      return NextResponse.json({ error: "no_subscription" }, { status: 400 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Don't relay Stripe's message to the client — it can name internal objects
    // and configuration. Log it, return something generic.
    console.error("[stripe/create-portal]", (err as Error)?.message);
    return NextResponse.json({ error: "portal_unavailable" }, { status: 502 });
  }
}
