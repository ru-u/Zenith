/**
 * Route-level loading silhouette for the app pages (history / analysis /
 * settings / engine): PageHeader-shaped bars over one glass panel of rows.
 * Theme-aware (`foreground/N`, not `white/N`) since these pages keep
 * light/dark, and the route ViewTransition cross-fades it into the real page.
 *
 * Motion is `.skeleton-sweep` per bar rather than one `animate-pulse` on the
 * wrapper. A pulse is an opacity fade, and on a phone — where .glass drops its
 * backdrop-filter below 40rem — it fades a flat fill against a flat background,
 * which reads as a parked screen. The bars share a duration and mount together,
 * so they stay in phase. Each `bg-foreground/N` still sets the resting tone:
 * Tailwind utilities beat `.skeleton-sweep`'s own fill (it lives in
 * @layer components precisely so they can).
 */
export function PageSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">Loading…</span>
      <div aria-hidden>
        <div className="skeleton-sweep h-3 w-28 rounded bg-foreground/10" />
        <div className="skeleton-sweep mt-3 h-8 w-56 rounded-md bg-foreground/10" />
        <div className="mt-8 overflow-hidden rounded-2xl bg-foreground/3 ring-1 ring-foreground/8">
          <div className="divide-y divide-foreground/5">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="px-6 py-4">
                <div className="skeleton-sweep h-9 rounded-md bg-foreground/6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
