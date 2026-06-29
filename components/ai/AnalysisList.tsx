"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { StockChart } from "@/components/gainers/StockChart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AIAnalysis } from "@/lib/supabase/types";

// Full-detail thesis view for the Pro /analysis page: one well-spaced block per
// thesis, ordered metadata → why it spiked → thesis → score/win %. No clamping —
// this is the depth view (the home card is the compact summary).
export function AnalysisList({ analyses }: { analyses: AIAnalysis[] }) {
  const ordered = [...analyses].sort(
    (a, b) =>
      (b.short_score ?? -1) - (a.short_score ?? -1) ||
      (a.rank ?? 99) - (b.rank ?? 99),
  );
  const companyByTicker = new Map(ordered.map((a) => [a.ticker, a.company_name]));
  const [chartTicker, setChartTicker] = useState<string | null>(null);

  return (
    <>
      <Dialog
        open={!!chartTicker}
        onOpenChange={(open) => !open && setChartTicker(null)}
      >
        <DialogContent className="sm:max-w-5xl p-0 overflow-hidden gap-0">
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
          {chartTicker && <StockChart key={chartTicker} ticker={chartTicker} />}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4">
        {ordered.map((a) => (
          <article key={a.ticker} className="glass flex flex-col gap-3 rounded-2xl p-6">
            {/* Metadata: ticker (+ company) left, score + win % right */}
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setChartTicker(a.ticker)}
                title={`View ${a.ticker} chart`}
                className="-mx-1 cursor-pointer rounded px-1 text-left text-xl font-semibold tracking-tight transition-colors hover:text-brand"
              >
                {a.ticker}
                {a.company_name && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {a.company_name}
                  </span>
                )}
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                {a.short_score != null && (
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                    Short {a.short_score}/10
                  </span>
                )}
                {a.percent_win_estimate != null && (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {a.percent_win_estimate}%
                    </span>{" "}
                    chance it closes lower next session
                  </span>
                )}
              </div>
            </div>

            {/* Why it spiked */}
            {a.catalyst && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Why it spiked: </span>
                {a.catalyst}
                {a.catalyst_url && (
                  <a
                    href={a.catalyst_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-0.5 text-brand hover:underline"
                  >
                    source
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
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
