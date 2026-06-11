"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getMarketSession,
  secondsUntilCloseET,
  type MarketSession,
} from "@/lib/market-calendar";

const SESSION: Record<
  MarketSession,
  { label: string; dot: string; text: string; live: boolean }
> = {
  open: { label: "Market open", dot: "bg-up", text: "text-up", live: true },
  "pre-market": {
    label: "Pre-market",
    dot: "bg-amber-400",
    text: "text-amber-300",
    live: false,
  },
  "after-hours": {
    label: "After-hours",
    dot: "bg-amber-400",
    text: "text-amber-300",
    live: false,
  },
  closed: {
    label: "Market closed",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    live: false,
  },
};

function clock(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function countdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MarketStatusBadge({ asOf }: { asOf: string | null }) {
  // Time-dependent state is client-only to avoid SSR hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const session = now ? getMarketSession(now) : null;
  const secsToClose = now ? secondsUntilCloseET(now) : null;
  const showCountdown =
    session === "open" && secsToClose != null && secsToClose <= 30 * 60;

  const s = session ? SESSION[session] : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Market session + closing countdown */}
      <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            s?.dot ?? "bg-muted-foreground",
            s?.live && "animate-pulse-dot",
          )}
        />
        <span className={s?.text ?? "text-muted-foreground"}>
          {s?.label ?? "Market"}
        </span>
        {showCountdown && (
          <span className="text-amber-300">
            · closes in {countdown(secsToClose!)} — get orders in
          </span>
        )}
      </span>

      {/* Data freshness */}
      <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-up",
            s?.live && "animate-pulse-dot",
          )}
        />
        Live as of {clock(asOf)}
      </span>
    </div>
  );
}
