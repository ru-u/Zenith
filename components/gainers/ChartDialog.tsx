"use client";

import { StockChart } from "./StockChart";
import { ChartDayMeta } from "./ChartDayMeta";
import { ChartHeaderClose } from "./ChartHeaderClose";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DailyGainer } from "@/lib/supabase/types";

// The one chart dialog used everywhere a ticker chart opens (home hero, home
// table, history table). Single component so the header bar above the
// TradingView chart — ticker + that day's gain / rank / streak — is identical
// on every chart in the app. The day/% always comes from the gainer's own row
// (`gainer.date`), so it's correct for both today and any past session.
export function ChartDialog({
  gainer,
  streak,
  onClose,
}: {
  gainer: DailyGainer | null;
  streak?: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!gainer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-5xl p-0 overflow-hidden gap-0 bg-background"
      >
        <DialogHeader className="relative px-6 py-5.25 border-b border-foreground/10">
          {/* One line at every width: the meta cluster holds its size and the
              long company name truncates beside it, so the divider + gap between
              the title and the date stay consistent on wide and narrow dialogs. */}
          <div className="flex items-center gap-x-4 pr-10">
            <DialogTitle className="flex min-w-0 items-baseline gap-2 text-base font-semibold tracking-tight">
              <span className="shrink-0">{gainer?.ticker}</span>
              {gainer?.company_name && (
                <span className="min-w-0 truncate font-normal text-muted-foreground">
                  — {gainer.company_name}
                </span>
              )}
            </DialogTitle>
            {gainer && (
              <ChartDayMeta
                date={gainer.date}
                changePercent={gainer.change_percent}
                rank={gainer.rank}
                streak={streak}
              />
            )}
          </div>
          <ChartHeaderClose />
        </DialogHeader>
        {gainer && <StockChart key={gainer.ticker} ticker={gainer.ticker} />}
      </DialogContent>
    </Dialog>
  );
}
