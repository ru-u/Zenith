"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Table, TableBody } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { GainerRow } from "@/components/gainers/GainerRow";
import { GainerTableHead } from "@/components/gainers/GainerTableHead";
import { ChartDialog } from "@/components/gainers/ChartDialog";
import { useTickerOpen } from "@/hooks/useTickerOpen";
import { cn } from "@/lib/utils";
import type { DailyGainer } from "@/lib/supabase/types";

interface DateResult {
  status: number;
  gainers: DailyGainer[];
}

async function fetchDate(date: string): Promise<DateResult> {
  const res = await fetch(`/api/gainers/${date}`);
  if (res.status === 403) return { status: 403, gainers: [] };
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  const json = (await res.json()) as { gainers: DailyGainer[] };
  return { status: 200, gainers: json.gainers };
}

function fmt(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function HistoryBrowser({ dates }: { dates: string[] }) {
  const [selected, setSelected] = useState(dates[0] ?? null);
  const [chartGainer, setChartGainer] = useState<DailyGainer | null>(null);
  const openTicker = useTickerOpen(setChartGainer);
  const strip = useRef<HTMLElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gainers", selected],
    queryFn: () => fetchDate(selected as string),
    enabled: !!selected,
  });

  if (dates.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
        No finalized trading days yet. Check back after the next market close.
      </div>
    );
  }

  const idx = selected ? dates.indexOf(selected) : -1;

  // Step one trading day without touching the strip. Swiping it is not a
  // reliable input on a phone: iOS hands a screen-edge drag to its own
  // interactive-pop recognizer before WebKit ever assigns the touch to a
  // scroller, and no CSS overrides that. These two buttons are the path no
  // gesture recognizer can steal. `dates` is newest-first, so left = newer.
  const step = (delta: number) => {
    const next = dates[idx + delta];
    if (!next) return;
    setSelected(next);
    // Every chip is already in the DOM, so the target can be scrolled into view
    // before React re-renders. `nearest` on BOTH axes: move only if it is
    // actually off screen, and never drag the page's vertical scroll along —
    // scrollIntoView walks every scrollable ancestor, not just this one. No
    // `behavior`, so it resolves from the element's own `scroll-behavior`,
    // which `scroll-smooth motion-reduce:scroll-auto` below already handles.
    strip.current
      ?.querySelector(`[data-date="${next}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <>
    <ChartDialog gainer={chartGainer} onClose={() => setChartGainer(null)} />
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      {/* A vertical list beside the table on desktop; a horizontal strip of
          chips above it on a phone. Stacked vertically it put up to 70vh of
          date buttons between the top of the page and any actual stock data.
          `dvh` rather than `vh` so mobile browser chrome counts against it.

          `md:contents` dissolves this wrapper on desktop so the <aside> is the
          200px grid cell again; the chevrons are display:none there, so they
          never claim a cell of their own. */}
      <div className="flex items-center gap-1 md:contents">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={idx <= 0}
          aria-label="Newer trading day"
          className="glass inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors disabled:opacity-30 md:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* `overscroll-x-contain` is a bug fix, not polish. Without it a drag on
            a strip parked at either end chains its overscroll out to the
            document, and `body` is `overflow-x: hidden` (globals.css) — so the
            only thing left to consume that chain is the browser's back/forward
            swipe, and tapping a chip with a few px of drift navigates away.
            The -x axis DELIBERATELY: this same element is a *vertical* scroller
            at md:, and containing y there would trap the wheel inside the 70dvh
            date list instead of letting it continue into the page. */}
        <aside
          ref={strip}
          className="glass flex flex-1 gap-1 scroll-px-8 scroll-smooth overflow-x-auto overscroll-x-contain rounded-2xl p-2 motion-reduce:scroll-auto md:max-h-[70dvh] md:flex-col md:overflow-x-hidden md:overflow-y-auto"
        >
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              data-date={d}
              onClick={() => setSelected(d)}
              aria-current={d === selected ? "true" : undefined}
              className={cn(
                // 44px tall on a touch screen (text-sm's 20px line box + py-3).
                // At the old py-2 these were 36px, under the iOS minimum, and an
                // undersized target is exactly what turns a tap into the stray
                // drag that used to navigate away. pointer-fine: keeps the
                // original density for the desktop list (cf. ThemeToggleButton).
                "shrink-0 rounded-lg px-3 py-3 text-sm whitespace-nowrap transition-colors pointer-fine:py-2 md:shrink md:text-left",
                d === selected
                  ? "bg-brand/20 text-foreground"
                  : "text-muted-foreground hover:bg-foreground/5",
              )}
            >
              {fmt(d)}
            </button>
          ))}
        </aside>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={idx < 0 || idx >= dates.length - 1}
          aria-label="Older trading day"
          className="glass inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors disabled:opacity-30 md:hidden"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full bg-foreground/5" />
            ))}
          </div>
        )}

        {!isLoading && data?.status === 403 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand">
              <Lock className="h-4 w-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              This date is older than the last 5 trading days. Upgrade to Pro
              for full history.
            </p>
            <Link
              href="/upgrade"
              className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
            >
              Upgrade to Pro
            </Link>
          </div>
        )}

        {!isLoading && data?.status === 200 && (
          <Table>
            <GainerTableHead />
            <TableBody>
              {data.gainers.slice(0, 50).map((g, i) => (
                <GainerRow
                  key={g.ticker}
                  gainer={g}
                  displayRank={i + 1}
                  onClick={() => openTicker(g)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
    </>
  );
}
