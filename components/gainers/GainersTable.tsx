"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { GainerRow } from "./GainerRow";
import { ChartDialog } from "./ChartDialog";
import { useGainers } from "@/hooks/useGainers";
import { useStreaks } from "@/hooks/useStreaks";
import { useFiltersStore } from "@/stores/filtersStore";
import type { DailyGainer } from "@/lib/supabase/types";

export function GainersTable({ limit = 50 }: { limit?: number }) {
  const { data, isLoading, isError } = useGainers();
  const { data: streaks } = useStreaks();
  const { search, minPrice, minMarketCap } = useFiltersStore();
  const [selected, setSelected] = useState<DailyGainer | null>(null);

  const rows = useMemo(() => {
    const all = data?.gainers ?? [];
    const q = search.trim().toUpperCase();
    return all
      .filter((g) => (minPrice != null ? (g.price ?? 0) >= minPrice : true))
      .filter((g) =>
        minMarketCap != null ? (g.market_cap ?? 0) >= minMarketCap : true,
      )
      .filter((g) =>
        q
          ? g.ticker.toUpperCase().includes(q) ||
            (g.company_name ?? "").toUpperCase().includes(q)
          : true,
      )
      .slice(0, limit);
  }, [data, search, minPrice, minMarketCap, limit]);

  return (
    <>
    <ChartDialog
      gainer={selected}
      streak={selected ? streaks?.get(selected.ticker) : undefined}
      onClose={() => setSelected(null)}
    />
    <div className="glass overflow-hidden rounded-2xl">
      <Table>
        <TableHeader>
          <TableRow className="border-foreground/10 hover:bg-transparent">
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
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i} className="border-foreground/5">
                <TableCell colSpan={8}>
                  <Skeleton className="h-6 w-full bg-foreground/5" />
                </TableCell>
              </TableRow>
            ))}

          {!isLoading &&
            rows.map((g, i) => (
              <GainerRow
                key={g.ticker}
                gainer={g}
                streak={streaks?.get(g.ticker)}
                displayRank={i + 1}
                onClick={() => setSelected(g)}
              />
            ))}

          {!isLoading && rows.length === 0 && (
            <TableRow className="border-foreground/5 hover:bg-transparent">
              <TableCell
                colSpan={8}
                className="py-12 text-center text-muted-foreground"
              >
                {isError
                  ? "Couldn't load gainers. Try again shortly."
                  : "No gainers match these filters."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
    </>
  );
}
