import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text(); // raw body required for signature verification
  const sig = req.headers.get("stripe-signature");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe/webhook] bad signature:", (err as Error).message);
    return new NextResponse("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  async function setTier(userId: string, tier: "free" | "pro") {
    await admin.from("profiles").update({ subscription_tier: tier }).eq("id", userId);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const uid = s.metadata?.supabase_user_id;
      if (uid) await setTier(uid, "pro");
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.supabase_user_id;
      if (uid) await setTier(uid, "free");
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
