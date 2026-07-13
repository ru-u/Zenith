import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayET } from "@/lib/market-calendar";
import { HistoryBrowser } from "@/components/history/HistoryBrowser";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <PageHeader
        eyebrow="Past sessions"
        title="History"
        description="Past trading days. Free accounts can browse the last 5 trading days."
        unique="history"
      />
      {children}
    </main>
  );
}

// Guests get a locked preview that funnels to signup instead of a dead-end
// login redirect (History is an account feature; the teaser sells it).
function HistoryTeaser() {
  return (
    <PageShell>
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
            See the last 5 trading days free — go Pro for unlimited history and
            streaks.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Link
              href="/auth/signup?next=/history"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
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
    </PageShell>
  );
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const dates = (data ?? []).map((d) => d.date);

  return (
    <PageShell>
      <HistoryBrowser dates={dates} />
    </PageShell>
  );
}
