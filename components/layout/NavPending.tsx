"use client";

import { useLinkStatus } from "next/link";

/** A tap-acknowledgement dot for nav links. MUST be rendered as a descendant of
 *  a <Link>, and that link needs `relative` — this is positioned absolutely.
 *
 *  It exists because a phone prefetches almost nothing here. <NavLinks> is
 *  `hidden … sm:block`, i.e. display:none below 640px, and Next's <Link>
 *  prefetch is IntersectionObserver-driven — a display:none element never
 *  intersects, so no header link is ever prefetched on a phone. <MobileNav>'s
 *  links fare little better: they live in a base-ui SheetPortal that mounts
 *  only when the drawer opens, so their prefetch gets however long the user
 *  spends reading the menu. Desktop, where the same links sit in the viewport
 *  on every page load, prefetches all of them immediately — which is why this
 *  only ever felt broken on a phone.
 *
 *  Three details are load-bearing:
 *  - ABSOLUTE, not a flex child. Seating it in normal flow meant giving the
 *    header and footer links a gap and turning them into flex containers,
 *    which widened every desktop nav link by ~12px to make room for a dot
 *    desktop will almost never show. Out of flow, it costs nothing anywhere.
 *  - It is ALWAYS rendered and only its opacity changes. Mounting it on
 *    `pending` would repaint the link mid-tap.
 *  - The 120ms animation-delay. Most navigations here beat that and should
 *    show nothing at all; without it every prefetched tap flashes, which reads
 *    as jank rather than as feedback. */
export function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className="pointer-events-none absolute top-1/2 right-1 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand opacity-0 data-pending:animate-[nav-pending_1s_ease-in-out_120ms_infinite] motion-reduce:data-pending:animate-none motion-reduce:data-pending:opacity-60"
    />
  );
}
