"use client";

import { useState } from "react";
import { StockChart } from "@/components/gainers/StockChart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AIAnalysis } from "@/lib/supabase/types";

// Full-detail thesis view for the Pro /analysis page: one well-spaced block per
// thesis, ordered metadata → score → why it spiked → thesis. No clamping — this
// is the depth view (the home card is the compact summary). Like the home card,
// percent_win_estimate is never rendered as a figure.
export function AnalysisList({ analyses }: { analyses: AIAnalysis[] }) {
  const ordered = [...analyses].sort(
    (a, b) =>
      (b.short_score ?? -1) - (a.short_score ?? -1) ||
      (a.rank ?? 99) - (b.rank ?? 99),
  );
  const companyByTicker = new Map(ordered.map((a) => [a.ticker, a.company_name]));
  // Venue qualifies the chart symbol — a bare ticker makes TradingView guess
  // the instrument (wrong for new listings). Null on pre-column rows.
  const exchangeByTicker = new Map(ordered.map((a) => [a.ticker, a.exchange]));
  const [chartTicker, setChartTicker] = useState<string | null>(null);

  return (
    <>
      <Dialog
        open={!!chartTicker}
        onOpenChange={(open) => !open && setChartTicker(null)}
      >
        <DialogContent className="gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-5xl">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-foreground/10">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {chartTicker}
              {chartTicker && companyByTicker.get(chartTicker) && (
                <span className="ml-2 font-normal text-muted-foreground">
                  — {companyByTicker.get(chartTicker)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {chartTicker && (
            <StockChart
              key={chartTicker}
              ticker={chartTicker}
              exchange={exchangeByTicker.get(chartTicker) ?? null}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4">
        {ordered.map((a, i) => (
          <article
            key={a.ticker}
            className="glass flex flex-col gap-3 rounded-2xl p-6 transition-colors hover:border-brand/25"
          >
            {/* Metadata: short-rank + ticker (+ company) left, score right.
                The list is sorted best→worst short — the number carries that. */}
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setChartTicker(a.ticker)}
                title={`View ${a.ticker} chart`}
                className="-mx-1 flex cursor-pointer items-baseline gap-2.5 rounded px-1 text-left text-xl font-semibold tracking-tight transition-colors hover:text-brand"
              >
                <span className="font-mono text-xs font-medium text-muted-foreground/70 tabular-nums">
                  #{i + 1}
                </span>
                <span>
                  {a.ticker}
                  {a.company_name && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {a.company_name}
                    </span>
                  )}
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-1.5">
                {a.catalyst_type === "macro" && (
                  <span className="rounded-full border border-amber-600/30 bg-amber-600/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-300">
                    Sector move
                  </span>
                )}
                {a.short_score != null && (
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                    Short {a.short_score}/10
                  </span>
                )}
              </span>
            </div>

            {/* How the scored session actually finished. The thesis is written
                at ~3:30 off a live spike; this is where that spike closed, which
                is the price a DECA order placed that day actually fills at. Only
                rendered once the finalize pass has stamped the row — older
                theses predate the column and simply omit the line.

                Sign-aware on purpose: a top-5 gainer at 3:30 can close deeply
                red (AIFU, 2026-09-04: -18.58%), which is exactly the case worth
                showing. `change_percent_at_score` is always a gain, so its "+"
                is hardcoded; `scored_day_change_percent` is NOT. */}
            {a.scored_day_change_percent != null && (
              <p className="font-mono text-xs text-muted-foreground">
                {a.change_percent_at_score != null && (
                  <>Scored at +{a.change_percent_at_score.toFixed(1)}% · </>
                )}
                closed{" "}
                <span
                  className={
                    a.scored_day_change_percent < 0 ? "text-down" : "text-up"
                  }
                >
                  {a.scored_day_change_percent > 0 ? "+" : ""}
                  {a.scored_day_change_percent.toFixed(1)}%
                </span>
              </p>
            )}

            {/* Why it spiked */}
            {a.catalyst && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Why it spiked: </span>
                {a.catalyst}
              </p>
            )}

            {/* Thesis */}
            <p className="text-base leading-relaxed text-muted-foreground">
              {a.short_thesis}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
