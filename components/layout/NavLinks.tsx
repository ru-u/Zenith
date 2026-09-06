"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LINKS, isActivePath } from "@/lib/nav";
import { NavPending } from "./NavPending";

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
              // `relative` only, to anchor <NavPending>'s absolute dot — it
              // adds no box of its own, so this stays the block-level link it
              // has always been and the header keeps its exact width.
              "relative hidden rounded-md px-3 py-1.5 transition-colors sm:block",
              active
                ? "bg-linear-to-r from-brand to-foreground bg-clip-text text-transparent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <NavPending />
          </Link>
        );
      })}
    </>
  );
}
