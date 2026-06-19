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
import { StockChart } from "./StockChart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
      <DialogContent className="sm:max-w-5xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-foreground/10">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {selected?.ticker}
            {selected?.company_name && (
              <span className="ml-2 font-normal text-muted-foreground">
                — {selected.company_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {selected && <StockChart key={selected.ticker} ticker={selected.ticker} />}
      </DialogContent>
    </Dialog>
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
