"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The landing page's single scroll effect: one subtle fade-up per section,
 * once. Anything fancier competes with the hero — don't add variants.
 *
 * The animation itself is CSS (`.reveal` in globals.css); this only flips
 * `data-revealed` when the section scrolls into view. It was framer-motion's
 * `whileInView`, but the library cost ~40KB gzip on the landing (and again on
 * the screener) to animate opacity and translateY.
 *
 * Reduced motion is handled entirely in CSS — `.reveal`'s rules live inside
 * `prefers-reduced-motion: no-preference`, so for those users the section is
 * simply visible and this observer's effect is inert. That keeps the SSR
 * markup identical for everyone, which is what the framer-motion version's
 * reducedMotion="user" was for: branching in JS caused hydration mismatches.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (or it throws): show the content rather than
    // leaving the section permanently at opacity 0.
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.revealed = "true";
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.dataset.revealed = "true";
          io.disconnect(); // once
        }
      },
      // Matches the old framer viewport margin: fire slightly after the
      // section's edge clears, not the instant it touches the fold.
      { rootMargin: "-80px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("reveal", className)}>
      {children}
    </div>
  );
}
