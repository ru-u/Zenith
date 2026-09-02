"use client";

import { useEffect, useRef } from "react";

const DURATION_MS = 900;
// framer-motion's "easeOut" is a cubic ease-out; this keeps the old feel.
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Tweens a number up to `value` on mount (and on any later change).
 *
 * Hand-rolled rather than framer-motion's `animate`/`useMotionValue`: this was
 * the last of the library's three uses, and it was ~40KB gzip on both the
 * landing and the screener. Like framer, the tween writes straight to the DOM
 * node instead of going through state — five hero cards each re-rendering ~54
 * times a second is exactly the cost this component existed to avoid.
 */
export function CountUp({
  value,
  decimals = 2,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // What's currently painted, so a mid-flight `value` change tweens from the
  // number on screen rather than snapping back to zero.
  const shown = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const format = (v: number) =>
      `${prefix}${v.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

    const from = shown.current;
    const settle = () => {
      shown.current = value;
      el.textContent = format(value);
    };

    // Read the preference here, not during render: branching on it in render
    // is what caused hydration mismatches before.
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduce || from === value) {
      settle();
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      if (t >= 1) return settle();
      shown.current = from + (value - from) * easeOut(t);
      el.textContent = format(shown.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, decimals, prefix, suffix]);

  // Server and first client render agree on zero (what the framer version also
  // rendered); the effect takes over immediately after hydration.
  return (
    <span ref={ref} className="tabular-nums">
      {`${prefix}${(0).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`}
    </span>
  );
}
