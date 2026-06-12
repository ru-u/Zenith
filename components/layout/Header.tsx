import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./UserMenu";

function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (meta.full_name as string) || (meta.name as string) || "";
  if (fromMeta.trim()) return fromMeta.trim();
  // Fall back to the email's local part (e.g. "ary07yadav") for accounts
  // created before we collected names.
  return user.email?.split("@")[0] ?? "Account";
}

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          {/* Replace public/logo.svg with your real logo (keep the filename). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Zenith" className="h-7 w-7 rounded-lg" />
          <span className="bg-gradient-to-br from-foreground to-brand bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            Zenith
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/history"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            History
          </Link>
          <Link
            href="/upgrade"
            className="rounded-md bg-brand/15 px-3 py-1.5 font-medium text-brand transition-colors hover:bg-brand/25"
          >
            Upgrade
          </Link>
          {user ? (
            <UserMenu name={displayName(user)} />
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
