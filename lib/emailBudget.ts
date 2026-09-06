// The two email ceilings Zenith lives inside.
//
//   Supabase Auth ......  50 per HOUR   — auth email only
//   Resend (free tier) .. 100 per DAY   — everything, shared
//
// This file exists because those are DIFFERENT UNITS and the distinction has
// been documented wrong more than once by reading one as the other. Anything
// that quotes a number to a human — ops alert copy, code comments, CLAUDE.md —
// should quote it from here.
//
// IMPORTANT: these are mirrors of external configuration, not controls.
// Changing a value here changes nothing about what the providers allow. The
// real settings live in:
//   - Supabase -> Authentication -> Rate Limits -> "Rate limit for sending
//     emails" (free to raise; it is a dashboard toggle)
//   - Resend -> the account plan itself (raising it is a billing decision)
//
// WHICH ONE BINDS: Resend. A single hour at Supabase's allowance would spend
// half of Resend's entire day, so in practice the daily quota is what runs out
// first. Raising the Supabase cap past what Resend can deliver does not buy
// headroom — it just moves the failure from a clean refusal at the Supabase
// layer to a 5xx mid-send underneath it (see `auth_email_send_failed` in
// lib/alerts.ts).

/** Supabase's cap on outbound auth email — confirmations, resends, resets. Per HOUR. */
export const SUPABASE_AUTH_EMAIL_PER_HOUR = 50;

/**
 * Resend's free-tier account quota. Per DAY, across EVERYTHING we send: auth
 * email, the pre-close drop, ops alerts, feedback notifications.
 */
export const RESEND_EMAILS_PER_DAY = 100;

/**
 * Resend's monthly quota. Exactly RESEND_EMAILS_PER_DAY × 30, so it can only be
 * hit by a run of maxed-out days — the daily number is the one worth watching.
 */
export const RESEND_EMAILS_PER_MONTH = 3_000;

/**
 * Pro subscribers at which the pre-close drop alone starts crowding out auth
 * email. The drop sends one email per Pro subscriber per trading day, so past
 * roughly this many, signups begin failing for reasons unrelated to signups.
 * This is the upgrade trigger — a subscriber count, not a date.
 */
export const PRO_SUBSCRIBERS_BEFORE_QUOTA_PRESSURE = 80;
