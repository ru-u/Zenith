"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/useMounted";
import {
  closeMinutesET,
  isTradingDay,
  secondsUntilCloseET,
} from "@/lib/market-calendar";

// The AI thesis "drop" lands ~30 min before the close (see lib/eod.ts /
// /api/cron/pre-close). This chip counts down to the next one — the landing
// page's live proof that the product runs on a real daily clock.
const DROP_LEAD_SECONDS = 30 * 60;

const ET = "America/New_York";

function clock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** "3:30 PM" (or "12:30 PM" on half-days) for a given date's drop time. */
function dropTimeLabel(date: Date): string {
  const mins = closeMinutesET(date) - 30;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

function nextTradingDay(from: Date): Date {
  const d = new Date(from);
  for (let i = 0; i < 10; i++) {
    d.setDate(d.getDate() + 1);
    if (isTradingDay(d)) break;
  }
  return d;
}

export function DropCountdown({ className }: { className?: string }) {
  const mounted = useMounted();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // ET wall-clock math is client-only (same hydration-safety pattern as
  // TradeWindowBanner) — hold the chip's box so nothing shifts when it fills.
  let content: React.ReactNode = null;
  let live = false;
  if (mounted) {
    const s = secondsUntilCloseET();
    if (s != null && s > DROP_LEAD_SECONDS) {
      content = (
        <>
          Next AI drop in{" "}
          <strong className="tabular-nums text-foreground">
            {clock(s - DROP_LEAD_SECONDS)}
          </strong>
        </>
      );
    } else if (s != null) {
      live = true;
      content = (
        <>
          Today&apos;s drop is <strong className="text-up">live</strong> —{" "}
          <strong className="tabular-nums text-foreground">{clock(s)}</strong>{" "}
          to the close
        </>
      );
    } else {
      const next = nextTradingDay(new Date());
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: ET,
        weekday: "long",
      }).format(next);
      content = (
        <>
          Next AI drop{" "}
          <strong className="text-foreground">
            {weekday} · {dropTimeLabel(next)} ET
          </strong>
        </>
      );
    }
  }

  return (
    <div
      className={cn(
        "glass inline-flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground",
        live && "ring-1 ring-up/40",
        className,
      )}
    >
      {live ? (
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-up" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
        </span>
      ) : (
        <Clock className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
      )}
      <span className="font-mono text-[13px]">
        {content ?? <span className="opacity-0">Next AI drop</span>}
      </span>
    </div>
  );
}
