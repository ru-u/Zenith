"use client";

import { usePathname } from "next/navigation";

/** Renders `children` everywhere except "/". Exists so <AppFooter> — which is
 *  otherwise entirely static — can stay a server component: a layout can't
 *  read the pathname, and that one check was the whole reason the footer and
 *  its markup were being shipped to the browser. */
export function HideOnLanding({ children }: { children: React.ReactNode }) {
  return usePathname() === "/" ? null : <>{children}</>;
}
