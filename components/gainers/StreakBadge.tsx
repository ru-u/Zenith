"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// Consecutive-day streak. Hidden below 2; hotter color the longer the run.
export function StreakBadge({
  count,
  className,
}: {
  count: number | undefined;
  className?: string;
}) {
  if (!count || count < 2) return null;

  const tone =
    count >= 5
      ? "text-orange-400 border-orange-400/30 bg-orange-400/10"
      : count >= 3
        ? "text-amber-300 border-amber-300/30 bg-amber-300/10"
        : "text-amber-200/80 border-amber-200/20 bg-amber-200/5";

  return (
    <span
      title={`${count} consecutive trading days`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        tone,
        className,
      )}
    >
      <Flame className="h-3 w-3" />
      {count}
    </span>
  );
}
