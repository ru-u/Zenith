import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/supabase/types";

const RISK: Record<RiskLevel, { label: string; cls: string }> = {
  low: { label: "Low risk", cls: "text-up border-up/30 bg-up/10" },
  medium: {
    label: "Medium risk",
    cls: "text-amber-300 border-amber-300/30 bg-amber-300/10",
  },
  high: {
    label: "High risk",
    cls: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  },
  extreme: { label: "Extreme risk", cls: "text-down border-down/30 bg-down/10" },
};

export function RiskLevelBadge({
  level,
  className,
}: {
  level: RiskLevel;
  className?: string;
}) {
  const r = RISK[level];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        r.cls,
        className,
      )}
    >
      {r.label}
    </span>
  );
}
