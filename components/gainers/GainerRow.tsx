"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { StreakBadge } from "./StreakBadge";
import { FavoriteStar } from "./FavoriteStar";
import type { DailyGainer } from "@/lib/supabase/types";
import {
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRelVolume,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { SECONDARY_COL } from "./GainerTableHead";

export function GainerRow({
  gainer,
  streak,
  displayRank,
  onClick,
  showFavorite,
}: {
  gainer: DailyGainer;
  streak?: number;
  displayRank: number;
  onClick?: () => void;
  // Opt-in so history rows (which reuse this component) stay untouched.
  showFavorite?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const up = (gainer.change_percent ?? 0) >= 0;
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
      </TableCell>
      <TableCell className={cn(SECONDARY_COL, "max-w-55 truncate text-muted-foreground")}>
        {gainer.company_name ?? "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPrice(gainer.price)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-semibold tabular-nums",
          up ? "text-up" : "text-down",
        )}
      >
        {formatPercent(gainer.change_percent)}
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
