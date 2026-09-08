import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayET } from "@/lib/market-calendar";
import { HistoryBrowser } from "@/components/history/HistoryBrowser";
import { HistoryShell } from "@/components/history/HistoryShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { dehydratedViewer } from "@/lib/viewerSeed";

export const dynamic = "force-dynamic";

// Guests get a locked preview that funnels to signup instead of a dead-end
// login redirect (History is an account feature; the teaser sells it).
//
// Currently unreachable: proxy.ts redirects signed-out /history requests to
// /auth/login before this renders. Kept as the correct fallback for the case
// where the proxy and this page disagree about the session.
function HistoryTeaser() {
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        aria-hidden
        className="pointer-events-none grid select-none gap-4 blur-sm md:grid-cols-[200px_1fr]"
      >
        <div className="glass flex flex-col gap-1.5 rounded-2xl p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-foreground/5" />
          ))}
        </div>
        <div className="glass space-y-2 rounded-2xl p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-7 rounded bg-foreground/5" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/50 p-6 text-center backdrop-blur-[2px]">
        <span className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand">
          <Lock className="h-4 w-4" />
        </span>
        <p className="text-sm font-medium">
          Browse past trading days with a free account
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          See the last 5 trading days and favorite tickers free — go Pro for
          unlimited history.
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Link
            href="/auth/signup?next=/history"
            className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
          >
            Create free account
          </Link>
          <Link
            href="/auth/login?next=/history"
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

// Everything that touches the database. Lives below the page's <Suspense> so the
// chrome in <HistoryShell> paints without waiting on it.
async function HistoryPanel() {
  // getViewer(), not a fresh auth.getUser(): this page used to build its own
  // client and re-validate the same token, which — with proxy.ts and <Header>
  // both doing it too — made FOUR getUser calls for one user in one request.
  // getViewer is cache()d per request, so <Header> has already paid for this.
  const { user } = await getViewer();
  if (!user) return <HistoryTeaser />;

  // Past trading days = any date before today. We don't gate on is_final
  // because intraday on-demand writes can flip that flag; a date before today
  // is inherently the final record (we never re-fetch past dates).
  // rank = 1 gives one row per date.
  const admin = createAdminClient();
  const today = getTodayET();
  const { data } = await admin
    .from("daily_gainers")
    .select("date")
    .lt("date", today)
    .eq("rank", 1)
    .order("date", { ascending: false })
    .limit(60);

  // Seeds ["viewer"] so the <ChartDialog> mounted inside <HistoryBrowser>
  // resolves its Pro gate from the document instead of a browser auth round
  // trip — see lib/viewerSeed.ts.
  return (
    <HydrationBoundary state={await dehydratedViewer()}>
      <HistoryBrowser dates={(data ?? []).map((d) => d.date)} />
    </HydrationBoundary>
  );
}

// SYNCHRONOUS. The awaits moved into <HistoryPanel> behind the boundary below,
// so the header and the page frame are shell content and flush immediately;
// only the panel waits on Supabase.
export default function HistoryPage() {
  return (
    <HistoryShell>
      <Suspense fallback={<PageSkeleton rows={6} header={false} />}>
        <HistoryPanel />
      </Suspense>
    </HistoryShell>
  );
}
