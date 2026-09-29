"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { StreakBadge } from "./StreakBadge";
import { FavoriteStar } from "./FavoriteStar";
import { DayRangeMeter } from "./DayRangeMeter";
import type { DailyGainer } from "@/lib/supabase/types";
import {
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRelVolume,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { RANGE_COL, SECONDARY_COL } from "./GainerTableHead";

export function GainerRow({
  gainer,
  streak,
  displayRank,
  onClick,
  showFavorite,
  live = false,
  showRange = true,
  rangeLocked = false,
}: {
  gainer: DailyGainer;
  streak?: number;
  displayRank: number;
  onClick?: () => void;
  // Opt-in so history rows (which reuse this component) stay untouched.
  showFavorite?: boolean;
  // Whether this row's figures are still updating — drives the meter's comet
  // and ping. Opt-in and decided by the caller, NOT read off `is_final` here:
  // history reuses this row, and a past date can still carry
  // `is_final = false` (see app/history/page.tsx), which animated a day that
  // will never change again.
  live?: boolean;
  // Must match the table's <GainerTableHead showRange>.
  showRange?: boolean;
  // Signed-out viewer: the day range is a free-account feature.
  rangeLocked?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const up = (gainer.change_percent ?? 0) >= 0;
  const range = {
    price: gainer.price,
    low: gainer.day_low,
    high: gainer.day_high,
    live,
    rank: displayRank,
    locked: rangeLocked,
  };
  return (
    <TableRow
      className={cn("group border-foreground/5", onClick && "cursor-pointer")}
      style={
        onClick && hovered
          ? {
              backgroundColor:
                "color-mix(in oklab, var(--foreground) 9%, transparent)",
            }
          : undefined
      }
      onMouseEnter={onClick ? () => setHovered(true) : undefined}
      onMouseLeave={onClick ? () => setHovered(false) : undefined}
      onClick={onClick}
    >
      {/* The star lives in the rank cell, right-aligned toward the ticker, in
          normal flow (ml-auto pushes it to the cell's right edge). It's always
          rendered — only its opacity toggles — so it never shifts the layout or
          overlaps the ticker (a different column entirely). This deliberately
          avoids absolute positioning, which behaved unreliably inside a <td>. */}
      <TableCell className="text-muted-foreground tabular-nums">
        <div className="flex items-center gap-2">
          <span>{displayRank}</span>
          {showFavorite && (
            <FavoriteStar
              ticker={gainer.ticker}
              revealOnHover
              className="ml-auto"
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">{gainer.ticker}</span>
          <StreakBadge count={streak} />
        </div>
        {/* Below `lg` there's no Day range column (RANGE_COL), so the meter
            rides here — the Ticker cell is the one that's always visible. */}
        {showRange && (
          <DayRangeMeter {...range} size="mini" className="mt-1.5 lg:hidden" />
        )}
      </TableCell>
      <TableCell className={cn(SECONDARY_COL, "max-w-55 truncate text-muted-foreground")}>
        {gainer.company_name ?? "—"}
      </TableCell>
      {showRange && (
        <TableCell className={RANGE_COL}>
          <DayRangeMeter {...range} size="full" className="mx-auto" />
        </TableCell>
      )}
      <TableCell className="text-right tabular-nums">
        {formatPrice(gainer.price)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-semibold tabular-nums lg:pl-5",
          // Brand for a gain, by choice (2026-09-28): every board row is a
          // gainer, so the column was a solid wall of green competing with the
          // cyan meter beside it. Red stays for the rare negative.
          !up && "text-down",
        )}
      >
        {/* On an inline span so the glow hugs the figure, not the whole
            (right-aligned, much wider) cell. */}
        {up ? (
          <span className="brand-figure">{formatPercent(gainer.change_percent)}</span>
        ) : (
          formatPercent(gainer.change_percent)
        )}
      </TableCell>
      <TableCell className={cn(SECONDARY_COL, "text-right tabular-nums text-muted-foreground")}>
        {formatMarketCap(gainer.market_cap)}
      </TableCell>
      <TableCell className={cn(SECONDARY_COL, "text-right tabular-nums text-muted-foreground")}>
        {formatRelVolume(gainer.relative_volume)}
      </TableCell>
      <TableCell className={cn(SECONDARY_COL, "max-w-40 truncate text-muted-foreground")}>
        {gainer.sector ?? "—"}
      </TableCell>
    </TableRow>
  );
}
