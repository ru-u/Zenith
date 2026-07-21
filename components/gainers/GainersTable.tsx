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
import { useFavorites } from "@/hooks/useFavorites";
import { useTickerOpen } from "@/hooks/useTickerOpen";
import { useFiltersStore } from "@/stores/filtersStore";
import type { DailyGainer } from "@/lib/supabase/types";

export function GainersTable({ limit = 50 }: { limit?: number }) {
  const { data, isLoading, isError } = useGainers();
  const { data: streaks } = useStreaks();
  const { data: favorites } = useFavorites();
  const { search, minPrice, minMarketCap, favoritesOnly } = useFiltersStore();
  const [selected, setSelected] = useState<DailyGainer | null>(null);
  const openTicker = useTickerOpen(setSelected);

  const { rows, rankOf } = useMemo(() => {
    const all = data?.gainers ?? [];
    const q = search.trim().toUpperCase();
    const isFav = (t: string) => favorites instanceof Set && favorites.has(t);

    const filtered = all
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
      .filter((g) => (favoritesOnly ? isFav(g.ticker) : true));

    // Rank labels come from the filtered order BEFORE pinning, so a pinned
    // favorite keeps its true position-in-view (a #7 stays "7") rather than
    // being renumbered to look like a top gainer.
    const ranks = new Map(filtered.map((g, i) => [g.ticker, i + 1]));

    // Pin favorites to the top, preserving relative order within each group.
    const ordered =
      favorites instanceof Set && favorites.size > 0
        ? [
            ...filtered.filter((g) => isFav(g.ticker)),
            ...filtered.filter((g) => !isFav(g.ticker)),
          ]
        : filtered;

    return { rows: ordered.slice(0, limit), rankOf: ranks };
  }, [data, search, minPrice, minMarketCap, favoritesOnly, favorites, limit]);

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
            <TableHead className="w-16">#</TableHead>
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
            rows.map((g) => (
              <GainerRow
                key={g.ticker}
                gainer={g}
                streak={streaks?.get(g.ticker)}
                displayRank={rankOf.get(g.ticker) ?? 0}
                onClick={() => openTicker(g)}
                showFavorite
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
                  : favoritesOnly
                    ? "None of your favorites made today's screener. Star a ticker to pin it here."
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
