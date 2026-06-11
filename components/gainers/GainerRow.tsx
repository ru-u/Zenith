"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { StreakBadge } from "./StreakBadge";
import type { DailyGainer } from "@/lib/supabase/types";
import {
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRelVolume,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function GainerRow({
  gainer,
  streak,
  displayRank,
}: {
  gainer: DailyGainer;
  streak?: number;
  // Sequential position within the (possibly filtered) view, 1..N.
  displayRank: number;
}) {
  const up = (gainer.change_percent ?? 0) >= 0;
  return (
    <TableRow className="border-white/5 hover:bg-white/[0.03]">
      <TableCell className="text-muted-foreground tabular-nums">
        {displayRank}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">{gainer.ticker}</span>
          <StreakBadge count={streak} />
        </div>
      </TableCell>
      <TableCell className="max-w-[220px] truncate text-muted-foreground">
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
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatMarketCap(gainer.market_cap)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatRelVolume(gainer.relative_volume)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {gainer.sector ?? "—"}
      </TableCell>
    </TableRow>
  );
}
