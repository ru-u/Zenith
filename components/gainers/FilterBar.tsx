"use client";

import { Search, Star, X } from "lucide-react";
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
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

const ANY = "any";

// The scrape already floors at ≥$3 / ≥$25M (lib/marketdata/normalize.ts), so
// those options would be no-ops — the dropdowns only offer tighter narrowing.
const PRICE_OPTIONS = [
  { v: ANY, label: "Any price" },
  { v: "5", label: "≥ $5" },
  { v: "10", label: "≥ $10" },
  { v: "20", label: "≥ $20" },
  { v: "50", label: "≥ $50" },
];

const CAP_OPTIONS = [
  { v: ANY, label: "Any market cap" },
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

// The popup surface itself comes from the SelectContent primitive
// (`.glass-popover`) — overriding bg/border here would clobber its gradient.
// Full width on a phone (the two selects share a row via the grid below), a
// fixed 160px from `sm:` up. At w-40 each plus a min-w-40 search field, the bar
// used to reflow into four stacked rows at 375px.
const TRIGGER =
  "h-9 w-full border-foreground/10 bg-foreground/5 hover:bg-foreground/10 sm:w-40";

export function FilterBar() {
  const {
    search,
    minPrice,
    minMarketCap,
    favoritesOnly,
    setSearch,
    setMinPrice,
    setMinMarketCap,
    setFavoritesOnly,
    reset,
  } = useFiltersStore();
  const { data: favorites } = useFavorites();

  // Only signed-in users get the chip — for guests the star is the entry point,
  // and a Set (not undefined/null) also avoids a loading-state flash.
  const showFavoritesChip = favorites instanceof Set;
  const hasFilters =
    search !== "" || minPrice != null || minMarketCap != null || favoritesOnly;

  return (
    <div className="glass grid grid-cols-2 items-center gap-2 rounded-xl p-2 sm:flex sm:flex-wrap">
      <div className="relative col-span-2 sm:min-w-40 sm:flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker or company…"
          // Placeholder-only labelling leaves the field unnamed to a screen
          // reader. Tickers are uppercase, so skip the phone keyboard's
          // autocapitalise-first-letter-only behaviour and label the Enter key.
          aria-label="Search ticker or company"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="border-foreground/10 bg-foreground/5 pl-8"
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
        <SelectContent alignItemWithTrigger={false}>
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
        <SelectContent alignItemWithTrigger={false}>
          {CAP_OPTIONS.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showFavoritesChip && (
        <button
          type="button"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          aria-pressed={favoritesOnly}
          className={cn(
            // Fills its grid cell on a phone (paired beside Reset), natural
            // width once the bar goes back to a flex row at `sm:`.
            "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors sm:w-auto sm:justify-start",
            favoritesOnly
              ? "border-brand/30 bg-brand/10 text-brand"
              : "border-foreground/10 bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          <Star className={cn("h-3.5 w-3.5", favoritesOnly && "fill-brand")} />
          Favorites
        </button>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-9 w-full text-muted-foreground hover:text-foreground sm:w-auto"
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
