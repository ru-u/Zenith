"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, Settings, LogOut, LogIn } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LINKS, isActivePath } from "@/lib/nav";
import { NavPending } from "./NavPending";
import { useSignOut } from "@/hooks/useSignOut";
import { cn } from "@/lib/utils";

const itemClass =
  "relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[0.9375rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50";

/** The phone nav. <NavLinks> hides itself under `sm:` (the header would
 *  otherwise overflow and drag the page wider), which left /screener,
 *  /analysis and /history with no entry point at all on a phone — /history was
 *  unreachable outright. This drawer is that entry point, and it renders only
 *  where the text nav doesn't.
 *
 *  `open` is controlled so a tapped link can close it: base-ui's Sheet is the
 *  Dialog primitive, whose Close/LinkItem convenience doesn't apply to plain
 *  <Link> children, and a drawer left open after navigating blocks scroll on
 *  the page underneath. */
export function MobileNav({
  isSignedIn,
  name,
  email,
}: {
  isSignedIn: boolean;
  name?: string;
  email?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const signOut = useSignOut();

  // Every link below already closes the drawer on tap, so this only catches the
  // routes that change underneath it: browser back/forward (an edge-swipe works
  // fine with the drawer open) and the redirects in proxy.ts. A drawer that
  // survives a navigation is a full-height fixed panel over the *new* page —
  // the same shape of bug as the ghost drawer documented in components/ui/sheet.tsx.
  //
  // Adjusted during render rather than in an effect: this is React's documented
  // "reset state when a prop changes" pattern, and it avoids the extra
  // commit-and-repaint (plus the react-hooks/set-state-in-effect error) that a
  // useEffect would cost.
  const [drawerRoute, setDrawerRoute] = useState(pathname);
  if (drawerRoute !== pathname) {
    setDrawerRoute(pathname);
    if (open) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-secondary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/50 sm:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="right" className="w-72 gap-0 p-0 sm:hidden">
        <SheetHeader className="border-b border-foreground/10 px-4 py-4 pr-14">
          {isSignedIn ? (
            <>
              <SheetTitle className="truncate text-left">{name}</SheetTitle>
              {email && (
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              )}
            </>
          ) : (
            <SheetTitle className="text-left">Menu</SheetTitle>
          )}
        </SheetHeader>

        <nav className="flex flex-col gap-0.5 p-2">
          {LINKS.map(({ href, label }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  itemClass,
                  active
                    ? "bg-brand/10 font-semibold text-brand"
                    : "text-foreground/90 hover:bg-secondary/60",
                )}
              >
                {label}
                <NavPending />
              </Link>
            );
          })}
        </nav>

        <div className="mx-2 h-px bg-border" />

        <nav className="flex flex-col gap-0.5 p-2">
          {isSignedIn ? (
            <>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={cn(itemClass, "text-foreground/90 hover:bg-secondary/60")}
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                Settings
                <NavPending />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className={cn(itemClass, "text-foreground/90 hover:bg-secondary/60")}
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className={cn(itemClass, "text-foreground/90 hover:bg-secondary/60")}
            >
              <LogIn className="h-4 w-4 text-muted-foreground" />
              Sign in
              <NavPending />
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
