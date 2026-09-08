import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";
import { displayName } from "@/lib/displayName";

// The auth-dependent half of <Header>, split out so it can sit behind a
// <Suspense> boundary.
//
// WHY: <Header> is rendered by the ROOT layout, so its `await getViewer()` used
// to block the entire document — every route in the app, above every
// per-segment loading.tsx (which Next nests *inside* the layout). For a signed-in
// user that is two serial Supabase round trips in front of the first byte, which
// also delays the browser's discovery of the stylesheet and the JS bundle. Guests
// never paid it: auth.getUser() short-circuits with AuthSessionMissingError when
// there is no session cookie and makes no network call at all, which is exactly
// why this never showed up in a signed-out check.
//
// These are two boundaries rather than one because <ThemeToggleButton> sits
// between them in the header and needs no auth — one boundary spanning the whole
// cluster would have made the theme toggle wait too. Both await the same
// cache()-memoized getViewer(), so they resolve off one pair of round trips and
// stream together.

// Both pills render into a fixed-width slot so the resolved state cannot shift
// the nav sideways. Sized to "Upgrade" — the state every guest and every free
// account lands on — so the overwhelming majority see no settle at all. A Pro
// account's shorter "Pro" badge right-aligns inside the same box.
const PILL_SLOT = "flex min-w-20 justify-end";

export function HeaderUpgradeFallback() {
  return (
    <div className={PILL_SLOT} aria-hidden>
      <div className="h-7 w-20 rounded-md bg-brand/10" />
    </div>
  );
}

export async function HeaderUpgrade() {
  const { isPro } = await getViewer();

  return (
    <div className={PILL_SLOT}>
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
    </div>
  );
}

// Reserves the phone menu button's exact 40px target and an approximation of the
// desktop account control, so the sticky h-14 bar keeps its height and the nav
// keeps its width while auth resolves.
export function HeaderAccountFallback() {
  return (
    <>
      <span className="hidden h-8 w-28 rounded-lg bg-foreground/5 sm:block" aria-hidden />
      <span className="h-10 w-10 sm:hidden" aria-hidden />
    </>
  );
}

export async function HeaderAccount() {
  const { user } = await getViewer();

  return (
    <>
      {/* Both of these are desktop-only: on phones the same actions live in
          <MobileNav>'s drawer, and rendering an avatar menu beside a hamburger
          gives a phone user two menus to choose between. */}
      {user ? (
        <span className="hidden sm:contents">
          <UserMenu name={displayName(user)} email={user.email ?? undefined} />
        </span>
      ) : (
        <Link
          href="/auth/login"
          className="hidden rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:block"
        >
          Sign in
        </Link>
      )}

      <MobileNav
        isSignedIn={!!user}
        name={user ? displayName(user) : undefined}
        email={user?.email ?? undefined}
      />
    </>
  );
}
