/** The app's primary routes.
 *
 *  Deliberately in a plain module rather than beside <NavLinks>: the header nav
 *  and drawer are client components but <AppFooter> is a server component, and
 *  a server component importing a value from a "use client" module gets a
 *  client-reference proxy instead of the array — `LINKS.map is not a function`
 *  at prerender. Keeping the list here lets all three share one definition, so
 *  adding a route reaches desktop, the phone drawer, and the footer at once. */
export const LINKS = [
  { href: "/screener", label: "Screener" },
  { href: "/analysis", label: "Analysis" },
  { href: "/history", label: "History" },
];

/** Whether `pathname` is `href` or a route nested under it. */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
