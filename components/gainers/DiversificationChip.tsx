"use client";

import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarClock, ExternalLink, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/useMounted";
import { DECA_SMG_SEASON, diversificationCountdown } from "@/lib/deca";
import { usePreferencesStore } from "@/stores/preferencesStore";

// Amber, not green: green is reserved for gains and "market live". 600 holds
// contrast on the light theme, where 400 washes out.
const AMBER = "text-amber-600 dark:text-amber-400";

// Date keys are calendar dates, so format them in UTC.
function fmtKey(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Day-by-day countdown to the DECA SMG asset-diversification deadline, sized to
// sit beside MarketStatusBadge. The details live in a popover rather than on
// the page, and "I'm diversified" hides it on this device — with a few seconds
// of inline Undo for a misclick, and a switch in /settings to bring it back. The rule note
// matters here more than anywhere: Zenith surfaces SHORT candidates, and only
// long stock positions count toward the stock requirement. Hidden once the
// deadline's 4 PM close has passed (diversificationCountdown returns null).
export function DiversificationChip() {
  const mounted = useMounted();
  const diversifiedFor = usePreferencesStore((s) => s.diversifiedFor);
  const setDiversifiedFor = usePreferencesStore((s) => s.setDiversifiedFor);
  const [, setTick] = useState(0);
  // Set by the hide button; holds an "Undo" pill in the chip's place briefly.
  const [justHidden, setJustHidden] = useState(false);
  useEffect(() => {
    if (!justHidden) return;
    const id = setTimeout(() => setJustHidden(false), 8_000);
    return () => clearTimeout(id);
  }, [justHidden]);
  useEffect(() => {
    // Day granularity — a minute tick is enough to roll over at ET midnight and
    // at 4 PM on the deadline itself.
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const deadline = DECA_SMG_SEASON.diversificationDeadline;
  // Client-only (ET wall-clock + localStorage), same hydration-safety pattern
  // as TradeWindowBanner.
  if (!mounted) return null;
  if (diversifiedFor === deadline) {
    if (!justHidden) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setDiversifiedFor(null);
          setJustHidden(false);
        }}
        className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        Countdown hidden ·
        <span className="inline-flex items-center gap-1 text-brand">
          <Undo2 className="h-3 w-3" aria-hidden />
          Undo
        </span>
      </button>
    );
  }
  const c = diversificationCountdown();
  if (!c) return null;

  const urgent = c.isToday || c.tradingDays <= 3;
  const label = c.isToday
    ? "Diversify by 4 PM today"
    : c.calendarDays === 1
      ? "Diversify by tomorrow"
      : `Diversify · ${plural(c.calendarDays, "day")} left`;

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/50",
          urgent ? AMBER : "text-muted-foreground",
          urgent && "ring-1 ring-amber-500/40",
        )}
      >
        <CalendarClock
          className={cn("h-3.5 w-3.5 shrink-0", urgent ? AMBER : "text-brand")}
          aria-hidden
        />
        <span className="tabular-nums">{label}</span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="glass-popover w-[min(20rem,calc(100vw-2rem))] rounded-xl p-4 text-sm outline-none">
            <Popover.Title className="font-medium text-foreground">
              DECA diversification deadline
            </Popover.Title>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {fmtKey(deadline, { weekday: "short", month: "short", day: "numeric" })}, 4 PM ET
              {" · "}
              {c.isToday ? "today" : `${plural(c.calendarDays, "day")} left`}
              {" · "}
              {plural(c.tradingDays, "trading day")}
            </p>
            <Popover.Description className="mt-3 text-muted-foreground">
              Hold at least <strong className="text-foreground">$10k each</strong> in long
              stock, mutual funds and bonds through{" "}
              {fmtKey(DECA_SMG_SEASON.end, { month: "short", day: "numeric" })}.{" "}
              <strong className="text-foreground">Short positions don&apos;t count</strong>{" "}
              toward stock.
            </Popover.Description>
            <div className="mt-4 flex items-center justify-between gap-3">
              <a
                href={DECA_SMG_SEASON.rulesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand underline-offset-2 hover:underline"
              >
                Official rules
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <Popover.Close
                onClick={() => {
                  setDiversifiedFor(deadline);
                  setJustHidden(true);
                }}
                className="rounded-lg bg-secondary/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand/50 outline-none"
              >
                I&apos;m diversified — hide
              </Popover.Close>
            </div>
            <p className="mt-2 text-right text-[11px] text-muted-foreground">
              You can turn it back on in Settings.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
