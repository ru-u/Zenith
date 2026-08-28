// READ-ONLY post-incident integrity check. Performs no writes.
//
// The `profiles_update_own` RLS policy (removed 2026-08-26) let any signed-in
// user set their own `subscription_tier` and `stripe_customer_id` from the
// browser with the public anon key. The policy is gone, but it was live in
// production for months — this script looks for evidence it was used.
//
//   node --env-file=.env.local scripts/check-integrity.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: profiles, error } = await db
  .from("profiles")
  .select("id, email, subscription_tier, stripe_customer_id, created_at, updated_at");
if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

const pro = profiles.filter((p) => p.subscription_tier === "pro");
console.log(`accounts: ${profiles.length}   pro: ${pro.length}\n`);

// Signature 1: Pro tier with no Stripe customer. The only legitimate way to
// reach 'pro' is the webhook, which fires after checkout creates a customer.
// Pro without one means the column was set outside the payment flow.
const noCustomer = pro.filter((p) => !p.stripe_customer_id);
console.log(`[1] pro with NO stripe_customer_id (self-granted?): ${noCustomer.length}`);
for (const p of noCustomer) {
  console.log(`      ${p.email}  created=${p.created_at?.slice(0, 10)}  updated=${p.updated_at?.slice(0, 10)}`);
}

// Signature 2: the same Stripe customer on two profiles — what planting
// someone else's customer id to reach their billing portal would look like.
const byCustomer = {};
for (const p of profiles) {
  if (p.stripe_customer_id) (byCustomer[p.stripe_customer_id] ??= []).push(p.email);
}
const dupes = Object.entries(byCustomer).filter(([, emails]) => emails.length > 1);
console.log(`\n[2] duplicate stripe_customer_id (portal hijack?): ${dupes.length}`);
for (const [cust, emails] of dupes) console.log(`      ${cust} -> ${emails.join(", ")}`);

// Signature 3: a pro row edited well after signup. Normal upgrades update the
// row at checkout time; a late edit with no customer id is the clearest tell.
console.log(`\n[3] pro rows edited >1 day after signup:`);
let late = 0;
for (const p of pro) {
  if (!p.created_at || !p.updated_at) continue;
  const days = (new Date(p.updated_at) - new Date(p.created_at)) / 86_400_000;
  if (days > 1) {
    console.log(`      ${p.email}  +${days.toFixed(1)}d  stripe=${p.stripe_customer_id ?? "NONE"}`);
    late++;
  }
}
if (!late) console.log("      none");

console.log(`\nAll clear = [1] and [2] are 0, and every row in [3] has a stripe id.`);
