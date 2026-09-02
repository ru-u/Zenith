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

// The route accepts no request body at all — there is nothing for a client to
// tamper with. Kept that way deliberately: the moment a plan/amount/coupon
// arrives from the browser, it has to be validated against a server-side
// allowlist instead.
//
// The amount itself now lives on a Stripe Price object (STRIPE_PRICE_ID) rather
// than inline in this file. That trade was made knowingly: an inline
// `price_data` mints a THROWAWAY Product + Price per checkout session, which
// splinters revenue reporting across one product per subscriber and — the
// reason it had to change — leaves nothing stable for the Billing Portal to
// name when offering a plan switch. Cost of the trade: the price is no longer
// greppable here, and changing it in the dashboard changes what people are
// charged with no deploy and no diff.
export async function POST(req: Request) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  // Fail closed rather than falling back to an inline price. A silent fallback
  // would quietly restore the throwaway-Product behaviour this replaced, and a
  // misconfigured deploy would look like it was working. Same reasoning as the
  // webhook's missing-secret guard.
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error("[stripe/create-checkout] STRIPE_PRICE_ID is not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  // Every call can create a Stripe customer and always creates a checkout
  // session — both are rate-limited resources on Stripe's side, and a loop here
  // would litter the dashboard and could trip Stripe's own abuse controls.
  const limited = checkLimit(req, {
    route: "stripe:checkout",
    limit: 10,
    windowSeconds: 600,
    userId: user.id,
  });
  if (limited) {
    logSecurityEvent("ratelimit.exceeded", {
      ip: clientIp(req),
      userId: user.id,
      route: "POST /api/stripe/create-checkout",
    });
    return limited;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Reuse or create the Stripe customer, persisting the id for the webhook path.
  let customerId = profile?.stripe_customer_id ?? null;

  // Validate the stored customer — it can be stale (created under a different
  // key/mode, e.g. after a live↔test switch). Recreate if it no longer resolves,
  // or if Stripe says it belongs to someone else: the id is only trustworthy
  // because the service role wrote it, and this route should not be the place
  // that assumption is load-bearing. Same reasoning as create-portal.
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      const deleted = "deleted" in existing && existing.deleted;
      const ownerId = deleted
        ? null
        : (existing as Stripe.Customer).metadata?.supabase_user_id;
      if (deleted || ownerId !== user.id) {
        if (!deleted) {
          logSecurityEvent("authz.denied", {
            ip: clientIp(req),
            userId: user.id,
            route: "POST /api/stripe/create-checkout",
            detail: `stored customer ${customerId} maps to ${ownerId ?? "no user"}; recreating`,
          });
        }
        customerId = null;
      }
    } catch {
      customerId = null;
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const appUrl = siteUrl();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Zenith Pro. The recurring interval and the amount live on the
      // Price object in Stripe; this id is mode-specific, so the test and live
      // values are different objects and must never be crossed over.
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/screener?upgraded=1`,
      cancel_url: `${appUrl}/upgrade`,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // The likeliest cause by far is a STRIPE_PRICE_ID from the other mode: a
    // test price under a live key (or the reverse) comes back as
    // `resource_missing`, which reads like a code bug unless it's named here.
    const e = err as { code?: string; message?: string };
    if (e?.code === "resource_missing") {
      console.error(
        `[stripe/create-checkout] price ${priceId} does not exist under this key — check STRIPE_PRICE_ID matches the key's mode`,
      );
    } else {
      console.error("[stripe/create-checkout]", e?.message);
    }
    return NextResponse.json({ error: "checkout_unavailable" }, { status: 502 });
  }
}
