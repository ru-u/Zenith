"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineChart } from "lucide-react";
import { StockChart } from "./StockChart";
import { ChartDayMeta } from "./ChartDayMeta";
import { ChartHeaderClose } from "./ChartHeaderClose";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/useSubscription";
import type { DailyGainer } from "@/lib/supabase/types";

// Charts are account-gated: signed-out visitors get a sign-up prompt where the
// chart would render. The header (ticker + day meta) stays visible as the
// teaser. `next` returns the user to the page they were browsing after auth.
function ChartSignupGate() {
  const pathname = usePathname();
  const next = encodeURIComponent(pathname || "/screener");
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="rounded-full bg-brand/10 p-3 text-brand">
        <LineChart className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          Sign up to view charts
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          A free account unlocks interactive price charts, streak badges, and
          the last 5 trading days of history.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={`/auth/signup?next=${next}`}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02]"
        >
          Create free account
        </Link>
        <Link
          href={`/auth/login?next=${next}`}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

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
  // tier === null means signed out; the hook resolves on page load (the dialog
  // is mounted closed), so the gate decision is ready before the first click.
  const { tier, loading } = useSubscription();
  const signedIn = tier !== null;
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
        {gainer &&
          (signedIn ? (
            <StockChart key={gainer.ticker} ticker={gainer.ticker} />
          ) : loading ? (
            <div className="h-105" aria-busy />
          ) : (
            <ChartSignupGate />
          ))}
      </DialogContent>
    </Dialog>
  );
}
