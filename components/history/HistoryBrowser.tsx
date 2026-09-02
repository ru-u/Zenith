"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
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

  return (
    <>
    <ChartDialog gainer={chartGainer} onClose={() => setChartGainer(null)} />
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      {/* A vertical list beside the table on desktop; a horizontal strip of
          chips above it on a phone. Stacked vertically it put up to 70vh of
          date buttons between the top of the page and any actual stock data.
          `dvh` rather than `vh` so mobile browser chrome counts against it. */}
      <aside className="glass flex gap-1 overflow-x-auto rounded-2xl p-2 md:max-h-[70dvh] md:flex-col md:overflow-x-visible md:overflow-y-auto">
        {dates.map((d) => (
          <button
            key={d}
            onClick={() => setSelected(d)}
            aria-current={d === selected ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors md:shrink md:text-left",
              d === selected
                ? "bg-brand/20 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5",
            )}
          >
            {fmt(d)}
          </button>
        ))}
      </aside>

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
