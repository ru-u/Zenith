import type { User } from "@supabase/supabase-js";

// Owner-only pages (the engine's paper-trade record, /admin/*). There is no
// admin role in the database on purpose: `profiles` has no write policy and
// every mutation runs on the service role, so a role column would be one more
// thing to protect. An env allowlist can't be changed from a browser.
//
// FAILS CLOSED: unset or empty `ADMIN_EMAILS` means nobody is an admin. Callers
// must 404 rather than 403, so the route's existence isn't confirmed to anyone
// probing for it, and must gate BEFORE any service-role read.
//
// Requires a confirmed address — an unconfirmed signup can claim any email.
export function isAdmin(user: User | null): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email || !user?.email_confirmed_at) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email);
}
