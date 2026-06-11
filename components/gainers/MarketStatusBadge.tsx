"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getTodayET,
  isTradingDay,
  secondsUntilOpenET,
  secondsUntilCloseET,
} from "@/lib/market-calendar";

type Phase = "pre-open" | "open" | "closed";

function clock(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function fmtDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "5h 12m" when over an hour out, else "MM:SS".
function countdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, "0")}`;
}

export function MarketStatusBadge({
  asOf,
  date,
}: {
  asOf: string | null;
  date: string | null;
}) {
  // Time-dependent state is client-only to avoid SSR hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  let phase: Phase | null = null;
  let toOpen: number | null = null;
  let toClose: number | null = null;
  let todayKey: string | null = null;

  if (now) {
    todayKey = getTodayET(now);
    if (!isTradingDay(now)) {
      phase = "closed";
    } else {
      toOpen = secondsUntilOpenET(now);
      toClose = secondsUntilCloseET(now);
      phase = toOpen != null ? "pre-open" : toClose != null ? "open" : "closed";
    }
  }

  // Left pill — market session.
  let dot = "bg-muted-foreground";
  let text = "text-muted-foreground";
  let pulse = false;
  let label = "Market";
  let extra: string | null = null;
  if (phase === "open") {
    dot = "bg-up";
    text = "text-up";
    pulse = true;
    label = "Market open";
    if (toClose != null && toClose <= 30 * 60) {
      extra = `· closes in ${countdown(toClose)} — get orders in`;
    }
  } else if (phase === "pre-open") {
    dot = "bg-amber-400";
    text = "text-amber-300";
    label = toOpen != null ? `Market opens in ${countdown(toOpen)}` : "Market opens soon";
  } else if (phase === "closed") {
    label = "Market closed";
  }

  // Right pill — data freshness / context.
  let liveDot = false;
  let freshness = "—";
  if (phase === "open") {
    liveDot = true;
    freshness = `Live as of ${clock(asOf)}`;
  } else if (phase != null && date) {
    freshness =
      date === todayKey ? "Close · 4:00 PM ET" : `Showing data from ${fmtDate(date)}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dot, pulse && "animate-pulse-dot")}
        />
        <span className={text}>{label}</span>
        {extra && <span className="text-amber-300">{extra}</span>}
      </span>

      <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            liveDot ? "bg-up" : "bg-muted-foreground",
            liveDot && "animate-pulse-dot",
          )}
        />
        {freshness}
      </span>
    </div>
  );
}
