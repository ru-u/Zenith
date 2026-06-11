"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { GainerRow } from "@/components/gainers/GainerRow";
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
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <aside className="glass flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-2xl p-2">
        {dates.map((d) => (
          <button
            key={d}
            onClick={() => setSelected(d)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm transition-colors",
              d === selected
                ? "bg-brand/20 text-foreground"
                : "text-muted-foreground hover:bg-white/5",
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
              <Skeleton key={i} className="h-7 w-full bg-white/5" />
            ))}
          </div>
        )}

        {!isLoading && data?.status === 403 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand">
              <Lock className="h-4 w-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              This date is older than 30 days. Upgrade to Pro for full history.
            </p>
            <Link
              href="/upgrade"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
            >
              Upgrade to Pro
            </Link>
          </div>
        )}

        {!isLoading && data?.status === 200 && (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Market Cap</TableHead>
                <TableHead className="text-right">Rel. Vol</TableHead>
                <TableHead>Sector</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.gainers.slice(0, 50).map((g) => (
                <GainerRow key={g.ticker} gainer={g} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
