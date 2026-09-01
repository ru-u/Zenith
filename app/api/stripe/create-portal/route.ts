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

/**
 * True only when Stripe says the customer does not exist — the stale-id case,
 * most often an id minted under the other mode's keys after a test↔live swap.
 *
 * Duck-typed rather than `instanceof`: stripe-node sets `type` from the class
 * name in its own constructor, and a string compare survives the esm/cjs
 * dual-package resolution that can quietly break `instanceof` under a bundler.
 */
function isMissingCustomer(err: unknown): boolean {
  const e = err as { type?: string; code?: string; statusCode?: number } | null;
  return (
    e?.type === "StripeInvalidRequestError" &&
    (e.code === "resource_missing" || e.statusCode === 404)
  );
}

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

  const customerId = profile.stripe_customer_id;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const appUrl = siteUrl();

  // Drop a customer id Stripe can no longer resolve, so the row heals itself
  // instead of failing this route forever. `create-checkout` already does the
  // same thing, which is why it survives a test↔live swap and this route did
  // not: it would retrieve a dead id, throw, and return a generic 502.
  const forgetCustomer = () =>
    admin.from("profiles").update({ stripe_customer_id: null }).eq("id", user.id);

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
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    // ONLY "this customer does not exist" is safe to forget. A transient
    // failure (Stripe down, network, rate limit) must leave the column alone:
    // clearing a live customer id on a blip would detach a paying subscriber
    // from their subscription, and their next upgrade would create a SECOND
    // customer and bill them twice.
    if (isMissingCustomer(err)) {
      await forgetCustomer();
      return NextResponse.json({ error: "no_subscription" }, { status: 400 });
    }
    console.error("[stripe/create-portal] retrieve failed:", (err as Error)?.message);
    return NextResponse.json({ error: "portal_unavailable" }, { status: 502 });
  }

  if ("deleted" in customer && customer.deleted) {
    // Deleted in the dashboard. The id can never resolve again, so forgetting
    // it loses nothing.
    await forgetCustomer();
    return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  }

  const ownerId = (customer as Stripe.Customer).metadata?.supabase_user_id;
  if (ownerId !== user.id) {
    logSecurityEvent("authz.denied", {
      ip,
      userId: user.id,
      route: "POST /api/stripe/create-portal",
      detail: `customer ${customerId} maps to ${ownerId ?? "no user"}`,
    });
    // Deliberately NOT cleared. A customer that exists but belongs to someone
    // else is a data-integrity problem worth leaving visible for investigation,
    // and `create-checkout` replaces it on the next upgrade attempt anyway.
    return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Don't relay Stripe's message to the client — it can name internal objects
    // and configuration. Log it, return something generic. In practice the most
    // likely cause is an unconfigured Billing Portal in this mode: the config
    // is per-mode and does not copy from test to live.
    console.error("[stripe/create-portal] session failed:", (err as Error)?.message);
    return NextResponse.json({ error: "portal_unavailable" }, { status: 502 });
  }
}
