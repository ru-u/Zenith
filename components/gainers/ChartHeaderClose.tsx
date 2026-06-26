"use client";

import { X } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Close button for the chart dialog. Replaces the default top-right corner X
// (via showCloseButton={false}) and restores the brand cyan (accent) hover.
// Vertically centered in the chart dialog's header bar; `className` can override
// placement if a header-less dialog ever needs it.
export function ChartHeaderClose({ className }: { className?: string }) {
  return (
    <DialogClose
      aria-label="Close"
      className={cn(
        "absolute right-3 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        className,
      )}
    >
      <X className="h-4 w-4" />
    </DialogClose>
  );
}
