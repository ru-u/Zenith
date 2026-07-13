import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayET } from "@/lib/market-calendar";
import { AnalysisList } from "@/components/ai/AnalysisList";
import { PageHeader } from "@/components/layout/PageHeader";
import type { AIAnalysis, SubscriptionTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function PageShell({
  headerSlot,
  children,
}: {
  headerSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <PageHeader
        eyebrow="The 3:30 drop"
        title="Short theses"
        description="The full next-day short analysis for today's top movers, ranked best→worst short."
        unique="analysis"
      >
        {headerSlot}
      </PageHeader>
      {children}
    </main>
  );
}

// Pro-gated upgrade teaser. Adapts the CTA to whether the visitor is signed in:
// guests get a signup funnel, free accounts get the upgrade funnel. The page reads
// via the admin client (bypasses RLS), so gating MUST happen before any data read.
function AnalysisTeaser({ signedIn }: { signedIn: boolean }) {
  return (
    <PageShell>
      <div className="relative overflow-hidden rounded-2xl">
        <div aria-hidden className="pointer-events-none select-none space-y-4 blur-sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass space-y-2 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div className="h-5 w-24 rounded bg-foreground/10" />
                <div className="h-5 w-20 rounded-full bg-foreground/10" />
              </div>
              <div className="h-3 w-full rounded bg-foreground/5" />
              <div className="h-3 w-5/6 rounded bg-foreground/5" />
              <div className="h-3 w-2/3 rounded bg-foreground/5" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/50 p-6 text-center backdrop-blur-[2px]">
          <span className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand">
            <Lock className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium">
            Unlock all 5 short theses with Zenith Pro
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Read the full catalyst, thesis, and next-day short score before today&apos;s
            close.
          </p>
          <div className="mt-1 flex items-center gap-2">
            {signedIn ? (
              <Link
                href="/upgrade"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
              >
                Upgrade to Pro · $4.99/mo
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/signup?next=/analysis"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
                >
                  Create free account
                </Link>
                <Link
                  href="/auth/login?next=/analysis"
                  className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default async function AnalysisPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <AnalysisTeaser signedIn={false} />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle<{ subscription_tier: SubscriptionTier }>();
  if (profile?.subscription_tier !== "pro") return <AnalysisTeaser signedIn />;

  // Latest date that actually has theses (≤ today) — so pre-drop we still show the
  // most recent set rather than an empty page.
  const admin = createAdminClient();
  const today = getTodayET();
  const { data: latest } = await admin
    .from("ai_analyses")
    .select("date")
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle<{ date: string }>();

  const date = latest?.date ?? null;
  const analyses: AIAnalysis[] = date
    ? ((
        await admin.from("ai_analyses").select("*").eq("date", date)
      ).data ?? [])
    : [];

  return (
    <PageShell
      headerSlot={
        date && date !== today ? (
          <span className="glass rounded-full px-3 py-1 font-mono text-xs text-muted-foreground">
            As of {date}
          </span>
        ) : undefined
      }
    >
      {analyses.length > 0 ? (
        <AnalysisList analyses={analyses} />
      ) : (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Today&apos;s short theses post about 30 minutes before the close — check
          back this afternoon to trade at today&apos;s price.
        </div>
      )}
    </PageShell>
  );
}
