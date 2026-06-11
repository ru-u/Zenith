"use client";

import { cn } from "@/lib/utils";
import type { MarketStatus } from "@/lib/market-calendar";

const STATUS: Record<
  MarketStatus,
  { label: string; dot: string; text: string; pulse: boolean }
> = {
  LIVE: { label: "LIVE", dot: "bg-up", text: "text-up", pulse: true },
  DELAYED: { label: "DELAYED", dot: "bg-amber-400", text: "text-amber-300", pulse: true },
  CLOSED: {
    label: "CLOSED",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    pulse: false,
  },
  HISTORICAL: { label: "HISTORICAL", dot: "bg-brand", text: "text-brand", pulse: false },
};

export function MarketStatusBadge({
  status,
  className,
}: {
  status: MarketStatus;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tracking-wide",
        s.text,
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          s.dot,
          s.pulse && "animate-pulse-dot",
        )}
        style={{ color: "currentColor" }}
      />
      {s.label}
    </span>
  );
}
