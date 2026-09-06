import { Table, TableBody } from "@/components/ui/table";
import { GainerTableHead } from "./GainerTableHead";
import { GainerRowSkeleton } from "./GainerRowSkeleton";

/** The route-level fallback for /screener (app/screener/loading.tsx).
 *
 *  Every shape here mirrors what the mounted-but-empty page renders — the same
 *  hero grid, the same filter bar box, the same table shell and skeleton rows
 *  <GainersTable> uses. That is the whole point: the page's client components
 *  put up their OWN skeletons the moment they hydrate, so a fallback that
 *  looked different would make one navigation read as two loads. Matching
 *  shapes turns the sequence into a single continuous fill-in.
 *
 *  Kept deliberately free of the real components: those are "use client" and
 *  each fires a fetch on mount, which is exactly what this stands in for. */
export function ScreenerSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
      <span className="sr-only" role="status">
        Loading today&apos;s gainers…
      </span>

      {/* <GainersHero> */}
      <section aria-hidden className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {/* The h1 is text-3xl/sm:text-4xl with a mt-1 text-sm subhead. */}
            <div className="skeleton-sweep h-9 w-80 max-w-full rounded-lg sm:h-10" />
            <div className="skeleton-sweep mt-2 h-4 w-64 max-w-full rounded" />
          </div>
          <div className="skeleton-sweep h-7 w-40 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-sweep h-37.5 rounded-2xl ring-1 ring-foreground/10"
            />
          ))}
        </div>
      </section>

      {/* <AIAnalysisCard> */}
      <div
        aria-hidden
        className="skeleton-sweep h-40 rounded-2xl ring-1 ring-foreground/10"
      />

      <section aria-hidden className="flex flex-col gap-3">
        {/* <FilterBar>: a 2-col grid of h-9 controls on a phone, one row above. */}
        <div className="glass grid grid-cols-2 items-center gap-2 rounded-xl p-2 sm:flex sm:flex-wrap">
          <div className="skeleton-sweep col-span-2 h-9 rounded-md sm:min-w-40 sm:flex-1" />
          <div className="skeleton-sweep h-9 rounded-md sm:w-40" />
          <div className="skeleton-sweep h-9 rounded-md sm:w-40" />
        </div>

        <div className="glass overflow-hidden rounded-2xl">
          <Table>
            <GainerTableHead />
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
                <GainerRowSkeleton key={i} />
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}
