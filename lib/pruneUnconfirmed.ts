import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { maybeAlert } from "./alerts";
import { getTodayET } from "./market-calendar";

// Deletes accounts that signed up but never confirmed their email address.
//
// Email confirmation is on, so `auth.users` gets a row (and `handle_new_user`
// creates a profile) the moment someone submits the signup form — before the
// address is proven. Those rows inflate every user count while belonging to
// people who cannot sign in, and if the pre-close email ever opens beyond Pro
// they would be addresses we have no permission to mail.
//
// Deletion is lossless. An account with `email_confirmed_at` null has never had
// a session, so it owns no favorites and no history; the person can simply sign
// up again. Deleting from `auth.users` cascades to `profiles` and `favorites`,
// while `feedback.user_id` is `on delete set null`, so bug reports outlive
// their author.

/** Accounts get this long from their last confirmation email before deletion. */
export const PRUNE_AFTER_HOURS = 24;

// If a single run turns up more than this, something is wrong with the data
// rather than with the users — a migration that nulled email_confirmed_at en
// masse would otherwise delete the entire user base on the next tick. Alert
// instead, and let a human look. This is the only irreversible operation in the
// codebase and it runs unattended, so it gets a hand brake.
const SANITY_CAP = 100;

export type PruneResult = {
  /** Rows the query matched. */
  found: number;
  /** Rows actually deleted (0 on a dry run or a refusal). */
  deleted: number;
  /** Deletions the admin API rejected. */
  failed: number;
  /** Set when the sanity cap refused to act. */
  refused?: string;
};

export async function pruneUnconfirmedUsers(
  admin: SupabaseClient<Database>,
  opts: { dryRun?: boolean; olderThanHours?: number } = {},
): Promise<PruneResult> {
  const hours = opts.olderThanHours ?? PRUNE_AFTER_HOURS;

  const { data, error } = await admin.rpc("list_prunable_unconfirmed", {
    p_hours: hours,
  });
  if (error) {
    console.error("[prune] list_prunable_unconfirmed failed:", error.message);
    throw new Error(error.message);
  }

  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return { found: 0, deleted: 0, failed: 0 };

  if (ids.length > SANITY_CAP) {
    const refused = `found ${ids.length} prunable accounts (cap ${SANITY_CAP}) — deleted nothing`;
    console.error("[prune]", refused);
    await maybeAlert(admin, {
      date: getTodayET(),
      type: "prune_anomaly",
      subject: `Zenith: unconfirmed-account prune refused (${ids.length} rows)`,
      body: [
        `The hourly prune matched ${ids.length} unconfirmed accounts, above the`,
        `safety cap of ${SANITY_CAP}. Nothing was deleted.`,
        "",
        "This is far more than organic signup should produce in an hour, so the",
        "likely causes are a migration that cleared email_confirmed_at on",
        "profiles/auth.users, or a signup flood.",
        "",
        "Check before overriding:",
        "  select count(*) from auth.users where email_confirmed_at is null;",
        "",
        "The prune stays blocked until the count drops below the cap.",
      ].join("\n"),
    });
    return { found: ids.length, deleted: 0, failed: 0, refused };
  }

  if (opts.dryRun) {
    console.log(`[prune] dry run — would delete ${ids.length} unconfirmed account(s)`);
    return { found: ids.length, deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    // No bulk delete exists on the admin API, and the counts here are small by
    // construction (anything large trips the cap above).
    const { error: delError } = await admin.auth.admin.deleteUser(id);
    if (delError) {
      console.error(`[prune] deleteUser(${id}) failed:`, delError.message);
      failed++;
      continue;
    }
    deleted++;
  }

  console.log(
    `[prune] deleted ${deleted}/${ids.length} unconfirmed account(s) older than ${hours}h` +
      (failed ? ` (${failed} failed)` : ""),
  );
  return { found: ids.length, deleted, failed };
}
