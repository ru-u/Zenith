"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The app's primary routes. Exported because <MobileNav> renders the same set
// in the drawer — the desktop nav below hides itself under `sm:`, so this list
// is the single definition feeding both. Adding a route here reaches phones and
// desktop at once.
export const LINKS = [
  { href: "/screener", label: "Screener" },
  { href: "/analysis", label: "Analysis" },
  { href: "/history", label: "History" },
];

/** Whether `pathname` is `href` or a route nested under it. */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The header's text nav. Client-side only for `usePathname` — the active
 *  link takes a brand→foreground gradient (cyan fading into polar white in
 *  dark mode) instead of a bar, so the glass bar stays uninterrupted. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map(({ href, label }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "hidden rounded-md px-3 py-1.5 transition-colors sm:block",
              active
                ? "bg-linear-to-r from-brand to-foreground bg-clip-text text-transparent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
