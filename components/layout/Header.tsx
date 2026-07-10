import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./UserMenu";
import { Logo } from "./Logo";
import { ThemeToggleButton } from "./ThemeToggleButton";
import type { SubscriptionTier } from "@/lib/supabase/types";

function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (meta.full_name as string) || (meta.name as string) || "";
  if (fromMeta.trim()) return fromMeta.trim();
  // Fall back to the email's local part (e.g. "jane.doe") for accounts
  // created before we collected names.
  return user.email?.split("@")[0] ?? "Account";
}

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pro status drives the nav: free/guest see "Upgrade", Pro see a "Pro" badge.
  let isPro = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .maybeSingle<{ subscription_tier: SubscriptionTier }>();
    isPro = data?.subscription_tier === "pro";
  }

  return (
    <header className="sticky top-0 z-20 border-b border-foreground/5 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center" aria-label="Zenith home">
          <Logo unique="header" />
        </Link>

        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {/* Text nav collapses on phones — the header otherwise overflows
              narrow viewports and drags the whole page wider. */}
          <Link
            href="/screener"
            className="hidden rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Screener
          </Link>
          <Link
            href="/analysis"
            className="hidden rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Analysis
          </Link>
          <Link
            href="/history"
            className="hidden rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            History
          </Link>

          {isPro ? (
            <Link
              href="/settings"
              title="Manage your Pro subscription"
              className="rounded-md bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/25"
            >
              Pro
            </Link>
          ) : (
            <Link
              href="/upgrade"
              className="rounded-md bg-brand/15 px-3 py-1.5 font-medium text-brand transition-colors hover:bg-brand/25"
            >
              Upgrade
            </Link>
          )}

          {/* Theme toggle — available to everyone, signed in or not. */}
          <ThemeToggleButton />

          {user ? (
            <UserMenu name={displayName(user)} email={user.email ?? undefined} />
          ) : (
            <Link
              href="/auth/login"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
