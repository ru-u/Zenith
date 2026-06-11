"use client";

import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useGainers } from "@/hooks/useGainers";
import { useFiltersStore } from "@/stores/filtersStore";

const ALL = "__all__";
const CHANGE_TIERS = [25, 50, 100, 200];

export function FilterBar() {
  const { data } = useGainers();
  const {
    sector,
    search,
    minChangePercent,
    setSector,
    setSearch,
    setMinChangePercent,
    reset,
  } = useFiltersStore();

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const g of data?.gainers ?? []) if (g.sector) set.add(g.sector);
    return [...set].sort();
  }, [data]);

  const hasFilters = sector != null || search !== "" || minChangePercent != null;

  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-xl p-2">
      <div className="relative min-w-[160px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker or company…"
          className="border-white/10 bg-white/5 pl-8"
        />
      </div>

      <Select
        value={sector ?? ALL}
        onValueChange={(v) => setSector(v === ALL ? null : v)}
      >
        <SelectTrigger className="w-[170px] border-white/10 bg-white/5">
          <SelectValue placeholder="Sector" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sectors</SelectItem>
          {sectors.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={minChangePercent != null ? String(minChangePercent) : ALL}
        onValueChange={(v) =>
          setMinChangePercent(v === ALL ? null : Number(v))
        }
      >
        <SelectTrigger className="w-[140px] border-white/10 bg-white/5">
          <SelectValue placeholder="Min change" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any change</SelectItem>
          {CHANGE_TIERS.map((t) => (
            <SelectItem key={t} value={String(t)}>
              ≥ +{t}%
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
