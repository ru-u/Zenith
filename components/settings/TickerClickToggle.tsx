"use client";

import { CandlestickChart, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/useMounted";
import {
  usePreferencesStore,
  type TickerClickAction,
} from "@/stores/preferencesStore";

const OPTIONS: {
  value: TickerClickAction;
  label: string;
  Icon: typeof CandlestickChart;
}[] = [
  { value: "chart", label: "Chart popup", Icon: CandlestickChart },
  { value: "google", label: "Google search", Icon: ExternalLink },
];

// Same segmented-control pattern as ThemeToggle: inert until mounted so the
// server render (default) can't mismatch the localStorage-persisted choice.
export function TickerClickToggle({ className }: { className?: string }) {
  const tickerClick = usePreferencesStore((s) => s.tickerClick);
  const setTickerClick = usePreferencesStore((s) => s.setTickerClick);
  const mounted = useMounted();
  const active = mounted ? tickerClick : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1",
          className,
        )}
      >
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTickerClick(value)}
            aria-pressed={active === value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active === value
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {active === "google"
          ? "Clicking a ticker opens a Google search for the stock in a new tab."
          : "Clicking a ticker opens the price chart right here on the page."}
      </p>
    </div>
  );
}
