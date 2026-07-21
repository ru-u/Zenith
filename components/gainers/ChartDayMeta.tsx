"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayLabel, formatPercent } from "@/lib/format";
import { StreakBadge } from "./StreakBadge";
import { FavoriteStar } from "./FavoriteStar";

// Compact context cluster shown inline in the chart dialog header (every chart,
// via ChartDialog): which day's gain the chart relates to, plus rank + streak,
// so the user never second-guesses the date — today or a past session. Lives in
// our own DOM above the TradingView iframe (which we can't annotate directly).
//
// This is also the deliberate place to favorite: the chart is where you decide
// a ticker is a short, and it's the reliable favorite affordance on touch
// (where the list's hover-reveal star never appears). Shown only when signed in
// (`showFavorite`) — guests get the whole-chart signup gate instead.
export function ChartDayMeta({
  date,
  changePercent,
  rank,
  streak,
  ticker,
  showFavorite,
}: {
  date: string | null | undefined;
  changePercent: number | null | undefined;
  rank: number | null | undefined;
  streak: number | undefined;
  ticker: string;
  showFavorite?: boolean;
}) {
  const up = (changePercent ?? 0) >= 0;
  const Arrow = up ? TrendingUp : TrendingDown;

  // The cluster never wraps and never shrinks (`shrink-0`): the title beside it
  // truncates instead, so the date/%/rank stay on one line beside the title at
  // every dialog width. The leading divider is always visible because the two
  // are guaranteed to share a line — no viewport breakpoint to fall out of sync
  // with the dialog's own (capped) width.
  return (
    <div className="flex shrink-0 items-center gap-x-3 text-[13px]">
      <span
        aria-hidden
        className="h-4 w-px shrink-0 bg-foreground/15"
      />
      <span className="font-medium text-muted-foreground tabular-nums">
        {formatDayLabel(date)}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-semibold tabular-nums",
          up ? "text-up" : "text-down",
        )}
      >
        <Arrow className="h-3.5 w-3.5 shrink-0" />
        {formatPercent(changePercent)}
      </span>
      {rank != null && (
        <span className="shrink-0 rounded-full border border-foreground/10 bg-foreground/4 px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
          #{rank}
        </span>
      )}
      <StreakBadge count={streak} />
      {showFavorite && <FavoriteStar ticker={ticker} />}
    </div>
  );
}
