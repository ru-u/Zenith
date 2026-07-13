"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/screener", label: "Screener" },
  { href: "/analysis", label: "Analysis" },
  { href: "/history", label: "History" },
];

/** The header's text nav. Client-side only for `usePathname` — the active
 *  link takes a brand→foreground gradient (cyan fading into polar white in
 *  dark mode) instead of a bar, so the glass bar stays uninterrupted. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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
