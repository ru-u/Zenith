"use client";

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
import { useFiltersStore } from "@/stores/filtersStore";

const ANY = "any";

// $3 (min tradeable price) and $25M (min market cap) are the product floors.
const PRICE_OPTIONS = [
  { v: ANY, label: "Any price" },
  { v: "3", label: "≥ $3" },
  { v: "5", label: "≥ $5" },
  { v: "10", label: "≥ $10" },
  { v: "20", label: "≥ $20" },
  { v: "50", label: "≥ $50" },
];

const CAP_OPTIONS = [
  { v: ANY, label: "Any market cap" },
  { v: "25000000", label: "≥ $25M" },
  { v: "100000000", label: "≥ $100M" },
  { v: "500000000", label: "≥ $500M" },
  { v: "1000000000", label: "≥ $1B" },
  { v: "10000000000", label: "≥ $10B" },
];

// value→label maps so base-ui resolves the trigger label without opening first.
const itemsOf = (opts: { v: string; label: string }[]) =>
  Object.fromEntries(opts.map((o) => [o.v, o.label]));
const PRICE_ITEMS = itemsOf(PRICE_OPTIONS);
const CAP_ITEMS = itemsOf(CAP_OPTIONS);

const TRIGGER = "h-9 w-[160px] border-white/10 bg-white/5";
const CONTENT = "w-(--anchor-width) border border-white/10 bg-popover";

export function FilterBar() {
  const {
    search,
    minPrice,
    minMarketCap,
    setSearch,
    setMinPrice,
    setMinMarketCap,
    reset,
  } = useFiltersStore();

  const hasFilters = search !== "" || minPrice != null || minMarketCap != null;

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
        items={PRICE_ITEMS}
        value={minPrice != null ? String(minPrice) : ANY}
        onValueChange={(v) => setMinPrice(v === ANY ? null : Number(v))}
      >
        <SelectTrigger className={TRIGGER}>
          <SelectValue placeholder="Price" />
        </SelectTrigger>
        <SelectContent className={CONTENT} alignItemWithTrigger={false}>
          {PRICE_OPTIONS.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={CAP_ITEMS}
        value={minMarketCap != null ? String(minMarketCap) : ANY}
        onValueChange={(v) => setMinMarketCap(v === ANY ? null : Number(v))}
      >
        <SelectTrigger className={TRIGGER}>
          <SelectValue placeholder="Market cap" />
        </SelectTrigger>
        <SelectContent className={CONTENT} alignItemWithTrigger={false}>
          {CAP_OPTIONS.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.label}
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
