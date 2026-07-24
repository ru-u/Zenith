import { cn } from "@/lib/utils";

/**
 * Route-level loading silhouette for the app pages (history / analysis /
 * settings): PageHeader-shaped bars over one glass panel of pulsing rows.
 * Theme-aware (`foreground/N`, not `white/N`) since these pages keep
 * light/dark, and the route ViewTransition cross-fades it into the real page.
 */
export function PageSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" className={cn("animate-pulse motion-reduce:animate-none", className)}>
      <span className="sr-only">Loading…</span>
      <div aria-hidden>
        <div className="h-3 w-28 rounded bg-foreground/10" />
        <div className="mt-3 h-8 w-56 rounded-md bg-foreground/10" />
        <div className="mt-8 overflow-hidden rounded-2xl bg-foreground/3 ring-1 ring-foreground/8">
          <div className="divide-y divide-foreground/5">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="px-6 py-4">
                <div className="h-9 rounded-md bg-foreground/6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
