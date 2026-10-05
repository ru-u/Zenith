"use client";

import { CalendarClock, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/useMounted";
import { DECA_SMG_SEASON } from "@/lib/deca";
import { usePreferencesStore } from "@/stores/preferencesStore";

// The way back for the screener's DiversificationChip after "I'm diversified —
// hide". Same segmented control and mount-gating as TickerClickToggle, since
// the choice lives in the same localStorage-persisted store.
export function DiversificationToggle() {
  const diversifiedFor = usePreferencesStore((s) => s.diversifiedFor);
  const setDiversifiedFor = usePreferencesStore((s) => s.setDiversifiedFor);
  const mounted = useMounted();
  const deadline = DECA_SMG_SEASON.diversificationDeadline;
  const active = mounted ? (diversifiedFor === deadline ? "hidden" : "shown") : undefined;

  const options = [
    { value: "shown", label: "Show", Icon: CalendarClock, onSelect: () => setDiversifiedFor(null) },
    { value: "hidden", label: "Hide", Icon: EyeOff, onSelect: () => setDiversifiedFor(deadline) },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
        {options.map(({ value, label, Icon, onSelect }) => (
          <button
            key={value}
            type="button"
            onClick={onSelect}
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
        {active === "hidden"
          ? "Hidden on this device. Turn it back on any time."
          : "Shown on the screener until the deadline passes."}
      </p>
    </div>
  );
}
