/**
 * /upgrade is `force-dynamic` and had no fallback, which is the worst of the
 * two states Next allows: a dynamic route without loading.tsx has its prefetch
 * SKIPPED entirely, so every tap paid a full cold server render with the old
 * page still on screen. It's also the one route link that stays visible in the
 * header on a phone, and it's the conversion path.
 *
 * Not <PageSkeleton>, which is a left-aligned header over a list — this page is
 * a single centered glass-strong card (app/upgrade/page.tsx), so the silhouette
 * has to be the card.
 */
export default function UpgradeLoading() {
  return (
    <main className="relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div
        aria-hidden
        className="glass-strong relative z-10 w-full max-w-md rounded-2xl p-8"
      >
        {/* eyebrow · price · feature list · CTA */}
        <div className="skeleton-sweep h-4 w-28 rounded" />
        <div className="skeleton-sweep mt-2 h-9 w-40 rounded-md" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-sweep h-5 w-full rounded" />
          ))}
        </div>
        <div className="skeleton-sweep mt-8 h-11 w-full rounded-lg" />
      </div>
    </main>
  );
}
