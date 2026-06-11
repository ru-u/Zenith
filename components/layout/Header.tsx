import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-md bg-gradient-to-br from-brand to-fuchsia-500 shadow-[0_0_16px_-2px] shadow-brand/60" />
          <span className="bg-gradient-to-br from-foreground to-brand bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            Zenith
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
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
            <UserMenu email={user.email ?? "account"} />
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
