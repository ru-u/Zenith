"use client";

import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSignupPromptStore } from "@/stores/signupPromptStore";

// ---------------------------------------------------------------------------
// Where the price sits inside today's range — the Fidelity 52-week-range bar,
// scaled to one session. DECA fills every order at the close, so the timing
// question for a short on a gainer is "still ripping, or already giving it
// back?", and the % change alone can't answer it: +80% at the high and +80%
// after a round trip from +300% read identically on the board (MSGY,
// 2026-09-25: +309% on the day, 29% off an $11.42 high).
//
// Brand cyan only. Position in the range is not a gain or a loss, and green is
// reserved for those (see the branding notes in CLAUDE.md).
//
// Motion is CSS-only, in the landing's Ascent language (keyframes in
// globals.css, defined inside the no-preference query so reduced-motion users
// get the same meter, static). The comet and the ping run only on LIVE rows —
// `is_final = false`, i.e. intraday data — so the motion itself says "this is
// moving"; a finalized day, history and the morning warm-up (which serves a
// finalized day) render still.
// ---------------------------------------------------------------------------

export interface DayRange {
  /** 0 = at the day's low, 1 = at the high. */
  pos: number;
  /** % below the day's high; null when the range is a single print. */
  offHigh: number | null;
}

/**
 * Null when any input is missing (rows stored before the columns existed) or
 * the range is inverted, which means bad upstream data rather than a real
 * session — rendering a confident marker off it would be worse than nothing.
 *
 * The clamp is only for float/rounding: the three figures come from one daily
 * bar, and a live probe of the top 40 rows (2026-09-25) had 40/40 inside it.
 */
export function dayRangePosition(
  price: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): DayRange | null {
  if (price == null || low == null || high == null) return null;
  if (![price, low, high].every(Number.isFinite) || high < low || high <= 0) {
    return null;
  }
  // A halted name or a single print has no range to place the price within.
  if (high === low) return { pos: 0.5, offHigh: null };
  const pos = Math.min(1, Math.max(0, (price - low) / (high - low)));
  const offHigh = Math.max(0, ((high - price) / high) * 100);
  return { pos, offHigh };
}

/**
 * "−2.7% off high" / "−29% off high", or "At high" when it rounds to zero.
 * The decimal goes at 10%+ because it buys nothing there and the label row has
 * to fit a 144px column between two prices (measured: 27 of 50 rows overflowed
 * with it).
 */
export function formatOffHigh(offHigh: number | null): string {
  if (offHigh == null) return "Flat range";
  const rounded = Math.round(offHigh * 10) / 10;
  if (rounded === 0) return "At high";
  return rounded >= 10
    ? `−${Math.round(offHigh)}% off high`
    : `−${rounded.toFixed(1)}% off high`;
}

type Size = "full" | "mini" | "wide";

const SIZE_CLASS: Record<Exclude<Size, "mini">, string> = {
  full: "w-36 xl:w-38",
  wide: "w-full",
};

/**
 * What a signed-out visitor sees in place of the meter: the day range is a
 * free-account feature (the server strips the figures for guests — see
 * withoutDayRanges in lib/gainers.ts, so there is nothing here to reveal).
 * Same footprint as a real meter so the table doesn't reflow on sign-in, and
 * it opens the same dismissible sign-up dialog as a guest's favorite star.
 */
function LockedDayRange({ size, className }: { size: Exclude<Size, "mini">; className?: string }) {
  const openPrompt = useSignupPromptStore((s) => s.open);
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={(e) => {
        // Rows and hero cards open the chart on click; this opens sign-up.
        e.stopPropagation();
        openPrompt(pathname || "/screener", "day-range");
      }}
      aria-label="Create a free account to see the day range"
      className={cn(
        "group/lock flex cursor-pointer flex-col gap-1 rounded-sm focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none",
        SIZE_CLASS[size],
        className,
      )}
    >
      <span className="relative block h-2.5 w-full">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10" />
        <span className="absolute top-1/2 left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background ring-1 ring-foreground/15 transition-colors group-hover/lock:ring-brand/60">
          <Lock className="size-2.5 text-muted-foreground transition-colors group-hover/lock:text-brand" />
        </span>
      </span>
      <span className="text-center text-[10px] leading-none text-muted-foreground transition-colors group-hover/lock:text-brand">
        Free account
      </span>
    </button>
  );
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export function DayRangeMeter({
  price,
  low,
  high,
  live = false,
  rank = 1,
  size = "full",
  locked = false,
  className,
}: {
  price: number | null | undefined;
  low: number | null | undefined;
  high: number | null | undefined;
  live?: boolean;
  /** Staggers the mount slide and the comet so they cascade down the board. */
  rank?: number;
  size?: Size;
  /** Signed-out viewer: render the sign-up affordance instead (none for mini). */
  locked?: boolean;
  className?: string;
}) {
  if (locked) {
    return size === "mini" ? null : <LockedDayRange size={size} className={className} />;
  }
  const range = dayRangePosition(price, low, high);
  const mini = size === "mini";
  const labelled = !mini;

  if (!range) {
    // A row with no stored high/low: before the columns existed, a row the
    // pre-deploy code inserted, or a name the feed sends without them (a
    // halt). An em dash at the row's own text size — the same "no data" mark
    // every other empty cell in the table uses — in a box as tall as a real
    // meter (h-6) so the row doesn't change height when data arrives.
    // Centered in the table column; left-aligned in the cards and the chart
    // strip, whose content is left-aligned. Under the ticker (mini): nothing.
    if (mini) return null;
    return (
      <div
        className={cn(
          "flex h-6 items-center text-muted-foreground",
          size === "full" ? `${SIZE_CLASS.full} justify-center` : "w-full justify-start",
          className,
        )}
        aria-label="Day range unavailable"
        role="img"
      >
        <span aria-hidden>—</span>
      </div>
    );
  }

  // Cap the stagger so the 50th row doesn't wait seconds to appear.
  const step = Math.min(Math.max(rank, 1), 20) - 1;
  const readout = formatOffHigh(range.offHigh);

  return (
    <div
      role="meter"
      aria-valuemin={low ?? undefined}
      aria-valuemax={high ?? undefined}
      aria-valuenow={price ?? undefined}
      aria-label={`Day range ${formatPrice(low)} to ${formatPrice(high)}, ${readout.replace("−", "")}`}
      data-live={live && !mini ? "" : undefined}
      className={cn(
        "day-range flex flex-col gap-1",
        size === "full" && "w-36 xl:w-38",
        size === "mini" && "w-full max-w-14",
        size === "wide" && "w-full",
        className,
      )}
      style={
        {
          "--pos": range.pos,
          "--dr-delay": `${step * 35}ms`,
          "--dr-comet-delay": `${step * 140}ms`,
        } as React.CSSProperties
      }
    >
      <div className={cn("relative", mini ? "h-2" : "h-2.5")}>
        {/* Track. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/12" />

        {/* Instrument ticks — quarter marks, so "about halfway" is legible. */}
        {!mini &&
          TICKS.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute top-1/2 h-1.25 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/15"
              style={{ left: `${t * 100}%` }}
            />
          ))}

        {/* Fill, low → price, in the Ascent gradient. Clips the comet. The
            gradient's white end is dark-only: in light mode `foreground` is
            near-black, which put a heavy dark stub against the marker. */}
        <div
          className="day-range-fill absolute top-1/2 left-0 h-1 -translate-y-1/2 overflow-hidden"
          style={{ width: "calc(var(--pos) * 100%)" }}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-linear-to-r from-brand-2 via-brand to-brand dark:to-foreground/90",
              mini ? "h-0.5" : "h-0.5 shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_55%,transparent)]",
            )}
          />
          {!mini && <span aria-hidden className="day-range-comet absolute inset-0" />}
        </div>

        {/* Marker: the Fidelity diamond, with a ping while live. */}
        <div
          className="day-range-marker absolute top-1/2"
          style={{ left: "calc(var(--pos) * 100%)" }}
        >
          {!mini && (
            <span
              aria-hidden
              className="day-range-ping absolute top-1/2 left-1/2 size-1.75 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-brand"
            />
          )}
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brand",
              mini
                ? "size-1.25"
                : "size-1.75 shadow-[0_0_10px_color-mix(in_oklab,var(--brand)_60%,transparent)]",
            )}
          />
        </div>
      </div>

      {labelled && (
        // The readout is the one that gives way (truncates) — a $100+ gainer
        // can't fit both prices and the full phrase in the table column, and
        // the endpoints are the figures that must never be clipped.
        <div className="flex items-baseline justify-between gap-1.5 text-[10px] leading-none tabular-nums">
          <span className="shrink-0 text-muted-foreground">{formatPrice(low)}</span>
          <span className="min-w-0 truncate font-medium text-brand">{readout}</span>
          <span className="shrink-0 text-muted-foreground">{formatPrice(high)}</span>
        </div>
      )}
    </div>
  );
}
