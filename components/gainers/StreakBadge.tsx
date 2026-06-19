"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// Consecutive-day streak. Hidden below 2. The flame + count render in the
// brand cyan→polar-white gradient (see #streak-grad in the root layout);
// streak length is conveyed by the chip's intensity, not colour.
export function StreakBadge({
  count,
  className,
}: {
  count: number | undefined;
  className?: string;
}) {
  if (!count || count < 2) return null;

  const chip =
    count >= 5
      ? "border-brand/40 bg-brand/15"
      : count >= 3
        ? "border-brand/30 bg-brand/10"
        : "border-brand/20 bg-brand/[0.06]";

  return (
    <span
      title={`${count} consecutive trading days`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        chip,
        className,
      )}
    >
      <Flame className="h-3 w-3" style={{ stroke: "url(#streak-grad)" }} />
      <span className="text-brand">{count}</span>
    </span>
  );
}
