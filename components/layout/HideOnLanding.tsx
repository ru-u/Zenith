"use client";

import { usePathname } from "next/navigation";

/** Routes that must NOT render <AppFooter>, and what carries the disclosure
 *  instead. Both cases already show the same lib/legal.ts lines — this is about
 *  which component does it, never about dropping the disclaimer.
 *
 *  "/"            -> <LandingFooter>, the marketing footer.
 *  the auth pages -> <Disclaimer affiliation> inside <AuthShell>. AppFooter is
 *                    196px of nav and legal text, which on a signup form is the
 *                    single largest block on the page and pushes the submit
 *                    button below the fold on a laptop. */
const NO_APP_FOOTER = new Set([
  "/",
  "/auth/login",
  "/auth/signup",
  "/forgot-password",
  "/reset-password",
]);

/** Renders `children` except on the routes above. Exists so <AppFooter> — which
 *  is otherwise entirely static — can stay a server component: a layout can't
 *  read the pathname, and that one check was the whole reason the footer and
 *  its markup were being shipped to the browser. */
export function HideOnLanding({ children }: { children: React.ReactNode }) {
  return NO_APP_FOOTER.has(usePathname()) ? null : <>{children}</>;
}
