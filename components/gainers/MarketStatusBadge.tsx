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
  isFinal = false,
}: {
  asOf: string | null;
  date: string | null;
  isFinal?: boolean;
}) {
  // Time-dependent state is client-only to avoid SSR hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // One-time synchronous seed so the live badge shows immediately on mount
    // (before the first 1s tick); the interval keeps it current. Reading the
    // clock at render instead would be impure, so it belongs here — this is the
    // intended client-clock idiom, not the cascading-render case the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Colors are applied via inline style (not Tailwind classes) so they render
  // reliably regardless of JIT class detection.
  const C = {
    green: "var(--up)",
    amber: "#fbbf24", // amber-400
    red: "var(--down)", // P&L loss-red — ties "closed" to the bearish theme
    cyan: "var(--brand)", // brand cyan — the official-close pill
    muted: "var(--muted-foreground)",
  };

  // Left pill — market session.
  let dotColor = C.muted;
  let pulse = false;
  let label = "Market";
  let extra: string | null = null;
  if (phase === "open") {
    dotColor = C.green;
    pulse = true;
    label = "Market open";
    if (toClose != null && toClose <= 30 * 60) {
      extra = `· closes in ${countdown(toClose)} — get orders in`;
    }
  } else if (phase === "pre-open") {
    dotColor = C.amber;
    label = toOpen != null ? `Market opens in ${countdown(toOpen)}` : "Market opens soon";
  } else if (phase === "closed") {
    dotColor = C.red;
    label = "Market closed";
  }

  // Right pill — data freshness / context.
  let rightDotColor = C.muted;
  let rightPulse = false;
  let freshness = "—";
  if (phase === "open") {
    rightDotColor = C.green;
    rightPulse = true;
    freshness = `Live as of ${clock(asOf)}`;
  } else if (phase != null && date) {
    if (date !== todayKey) {
      // Weekend/holiday/pre-open: showing the last finalized trading day.
      freshness = `Showing data from ${fmtDate(date)}`;
    } else if (isFinal) {
      // The official close is locked in.
      rightDotColor = C.cyan;
      freshness = "4:00 PM ET";
    } else {
      // Closed, but the close hasn't settled yet — be honest about the real
      // time of the last snapshot rather than implying it's the 4:00 PM close.
      rightDotColor = C.amber;
      freshness = `As of ${clock(asOf)} · finalizing`;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", pulse && "animate-pulse-dot")}
          style={{ backgroundColor: dotColor }}
        />
        <span style={{ color: dotColor }}>{label}</span>
        {extra && <span style={{ color: C.amber }}>{extra}</span>}
      </span>

      <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", rightPulse && "animate-pulse-dot")}
          style={{ backgroundColor: rightDotColor }}
        />
        <span style={{ color: rightDotColor }}>{freshness}</span>
      </span>
    </div>
  );
}
