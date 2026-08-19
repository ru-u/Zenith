// Single source of truth for resolving a user's display name.
//
// Storage note: the name lives in Supabase auth user_metadata, not in
// `profiles`. That's fine EXCEPT that GoTrue re-merges the OAuth provider's
// identity payload into user_metadata on every sign-in — and Google's payload
// includes both `name` and `full_name`. So anything the user edits into
// `full_name` is silently reverted to their Google name the next time they
// sign in with Google.
//
// `display_name` is the user's own edit. Google never sends that key, so the
// provider refresh leaves it untouched and it always wins. `full_name` /
// `name` remain as the provider-supplied fallback for accounts that never
// edited anything.
//
// The read order was duplicated in Header and the settings page and had to
// stay in sync across both plus the two forms that write it — same reason
// lib/pricing.ts exists.

type MetaUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

/** The name as stored, or "" — no email fallback. For prefilling the edit form. */
export function storedName(user: MetaUser): string {
  const meta = user.user_metadata ?? {};
  const value =
    (meta.display_name as string) ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    "";
  return value.trim();
}

/** The name to render in UI chrome, always non-empty. */
export function displayName(user: MetaUser): string {
  const stored = storedName(user);
  if (stored) return stored;
  // Fall back to the email's local part (e.g. "jane.doe") for accounts
  // created before we collected names.
  return user.email?.split("@")[0] ?? "Account";
}
