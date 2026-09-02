import { Skeleton } from "@/components/ui/skeleton";

/**
 * What /screener shows while the server is still reading the board.
 *
 * Deliberately plain server markup — no client components. The real tree is
 * what streams in behind it, and mounting those components here too would have
 * them hydrate and fire their own fetches only to be replaced.
 *
 * Shapes mirror <GainersHero> and <GainersTable> closely enough that the swap
 * isn't a jolt: the heading is real text (it's static anyway), then the five
 * hero tiles and a stack of rows.
 */
export function ScreenerSkeleton() {
  return (
    <section className="flex flex-col gap-10" aria-busy>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="bg-linear-to-br from-foreground to-brand bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            Today&apos;s top short candidates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The day&apos;s biggest market gainers, ranked highest to lowest.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass h-37.5 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl p-4">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full bg-foreground/5" />
          ))}
        </div>
      </div>
    </section>
  );
}
