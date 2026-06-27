"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/useMounted";
import {
  closeMinutesET,
  getMarketSession,
  secondsUntilCloseET,
} from "@/lib/market-calendar";

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ET-explicit reminder that DECA orders placed during the session fill at today's
// close — the whole reason the AI theses drop pre-close. Shown only while the
// market is open; turns urgent (green) in the final 30 min, where the theses are
// live and there's still time to place orders.
export function TradeWindowBanner() {
  const mounted = useMounted();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Client-only (ET wall-clock) — render nothing on the server to avoid a
  // hydration mismatch, and only during the regular session.
  if (!mounted || getMarketSession() !== "open") return null;
  const secs = secondsUntilCloseET();
  if (secs == null) return null;

  const urgent = secs <= 30 * 60;
  const closeHour = Math.floor(closeMinutesET() / 60);
  const closeLabel = `${closeHour > 12 ? closeHour - 12 : closeHour}:00 PM ET`;

  return (
    <div
      className={cn(
        "glass flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm",
        urgent && "ring-1 ring-up/40",
      )}
    >
      <Clock className={cn("h-4 w-4 shrink-0", urgent ? "text-up" : "text-brand")} />
      <p className="text-muted-foreground">
        Orders placed before{" "}
        <strong className="text-foreground">{closeLabel}</strong> fill at{" "}
        <strong className="text-foreground">today&apos;s close</strong> —{" "}
        <strong className={cn("tabular-nums", urgent ? "text-up" : "text-foreground")}>
          {fmt(secs)} left
        </strong>
        {urgent ? " to get orders in." : "."}
      </p>
    </div>
  );
}
