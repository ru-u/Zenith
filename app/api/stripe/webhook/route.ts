import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, logSecurityEvent } from "@/lib/seclog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stripe is the only thing allowed to change a subscription tier. The signature
// check below is what makes that true — without it, anyone who knows the URL
// could POST a checkout.session.completed and grant themselves Pro.
export async function POST(req: Request) {
  const body = await req.text(); // raw body required for signature verification
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Fail closed on a missing secret rather than letting `constructEvent` decide
  // what `undefined!` means.
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? "", secret);
  } catch (err) {
    // Also covers replay: constructEvent enforces a 5-minute tolerance on the
    // timestamp inside the signature, so a captured payload can't be resent
    // later to re-trigger an upgrade.
    logSecurityEvent("webhook.bad_signature", {
      ip: clientIp(req),
      route: "POST /api/stripe/webhook",
      detail: (err as Error).message,
    });
    return new NextResponse("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  async function setTier(userId: string, tier: "free" | "pro") {
    const { error } = await admin
      .from("profiles")
      .update({ subscription_tier: tier })
      .eq("id", userId);
    if (error) {
      // Loud: a dropped write here means a paying customer without Pro, or a
      // churned one who keeps it. Throwing returns a 500, and Stripe retries.
      console.error(`[stripe/webhook] setTier(${tier}) failed:`, error.message);
      throw new Error("tier update failed");
    }
  }

  /**
   * Resolve the Supabase user for a subscription. The metadata we set at
   * checkout is the fast path; the customer lookup is the fallback for
   * subscriptions created outside that flow (a Stripe dashboard comp, a plan
   * migration) whose metadata we never wrote. Without the fallback those
   * cancellations silently no-op and the user keeps Pro forever.
   */
  async function userIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
    const fromMetadata = sub.metadata?.supabase_user_id;
    if (fromMetadata) return fromMetadata;

    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customerId) return null;

    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  }

  // Statuses that should keep Pro switched on. `past_due` is deliberately
  // included — Stripe retries a failed payment for days, and yanking access on
  // the first decline punishes people whose card just expired. `unpaid` is
  // where retries have given up.
  const ACTIVE = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const uid = s.metadata?.supabase_user_id;
        // A completed session is not necessarily a paid one (async payment
        // methods complete first and settle later). Only `paid` grants access;
        // the delayed ones arrive as async_payment_succeeded below.
        if (uid && s.payment_status === "paid") await setTier(uid, "pro");
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        const uid = s.metadata?.supabase_user_id;
        if (uid) await setTier(uid, "pro");
        break;
      }

      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const uid = s.metadata?.supabase_user_id;
        if (uid) await setTier(uid, "free");
        break;
      }

      // The event that was missing. A subscription that lapses, gets cancelled
      // at period end, or is switched off in the dashboard arrives here — not
      // as `deleted` — so without this branch access outlived payment.
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await userIdForSubscription(sub);
        if (uid) await setTier(uid, ACTIVE.has(sub.status) ? "pro" : "free");
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await userIdForSubscription(sub);
        if (uid) await setTier(uid, "free");
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Return non-2xx so Stripe redelivers. Every branch above is idempotent —
    // setting a tier to the value it already has is a no-op — so a retry is
    // always safe and no separate event-dedup table is needed.
    console.error("[stripe/webhook] handler failed:", (err as Error)?.message);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
