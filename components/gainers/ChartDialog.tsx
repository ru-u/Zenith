"use client";

import { useId } from "react";
import { usePathname } from "next/navigation";
import { LineChart } from "lucide-react";
import { StockChart } from "./StockChart";
import { ChartDayMeta } from "./ChartDayMeta";
import { ChartHeaderClose } from "./ChartHeaderClose";
import { AuthGatePrompt } from "./AuthGatePrompt";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/useSubscription";
import type { DailyGainer } from "@/lib/supabase/types";

// Fake intraday walk for the blurred teaser behind the sign-up gate. Seeded by
// ticker so every stock gets its own stable shape (no flicker across opens),
// with an upward drift + late pop — these are the day's gainers, so the tease
// should look like one. Not real data; it renders only behind a blur.
function teaserPath(ticker: string): { line: string; area: string } {
  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) {
    h = ((h ^ ticker.charCodeAt(i)) * 16777619) >>> 0;
  }
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const n = 48;
  let v = 30 + rand() * 25;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    v = Math.max(8, Math.min(92, v + (rand() - 0.42) * 7));
    if (i > n - 8) v = Math.min(94, v + rand() * 2.5);
    const x = ((i / (n - 1)) * 800).toFixed(1);
    const y = (400 - v * 4).toFixed(1);
    pts.push(`${i ? "L" : "M"}${x},${y}`);
  }
  const line = pts.join(" ");
  return { line, area: `${line} L800,400 L0,400 Z` };
}

// Charts are account-gated: signed-out visitors get a sign-up prompt over a
// blurred teaser chart, in the exact footprint the real chart occupies (h-170
// = StockChart's 680px), so the dialog is indistinguishable size-wise. The
// header (ticker + day meta) stays visible as part of the tease. `next`
// returns the user to the page they were browsing after auth.
function ChartSignupGate({ ticker }: { ticker: string }) {
  const pathname = usePathname();
  const gradId = useId();
  const next = encodeURIComponent(pathname || "/screener");
  const { line, area } = teaserPath(ticker);
  return (
    <div className="relative h-170 w-full overflow-hidden">
      {/* Blurred fake area chart — same brand-cyan styling as the real
          TradingView overrides. scale-105 hides the blur's edge fringing. */}
      <div aria-hidden className="absolute inset-0 scale-105 blur-sm">
        <svg
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2EE6E6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#2EE6E6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[80, 160, 240, 320].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="800"
              y2={y}
              className="stroke-foreground/10"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {[133, 267, 400, 533, 667].map((x) => (
            <line
              key={x}
              x1={x}
              y1="0"
              x2={x}
              y2="400"
              className="stroke-foreground/5"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${gradId})`} />
          <path
            d={line}
            fill="none"
            stroke="#2EE6E6"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {/* Scrim so the prompt stays legible over the teaser. */}
      <div aria-hidden className="absolute inset-0 bg-background/55" />
      <div className="relative flex h-full items-center justify-center px-6">
        {/* Same medallion + copy + CTA as the favorite popup — one gate system. */}
        <AuthGatePrompt
          icon={LineChart}
          title="Sign up to view charts"
          description="A free account unlocks interactive price charts, streak badges, favorites, and the last 5 trading days of history."
          next={next}
        />
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
        // Don't pull focus onto the first control (the metadata-bar favorite
        // star) when the chart is opened by mouse/touch — that lit its
        // focus-visible ring on open. Keyboard opens still move focus in.
        initialFocus={(openType) => openType === "keyboard"}
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
                ticker={gainer.ticker}
                showFavorite={signedIn}
              />
            )}
          </div>
          <ChartHeaderClose />
        </DialogHeader>
        {gainer &&
          (signedIn ? (
            <StockChart
              key={gainer.ticker}
              ticker={gainer.ticker}
              exchange={gainer.exchange}
            />
          ) : loading ? (
            <div className="h-170" aria-busy />
          ) : (
            <ChartSignupGate ticker={gainer.ticker} />
          ))}
      </DialogContent>
    </Dialog>
  );
}
