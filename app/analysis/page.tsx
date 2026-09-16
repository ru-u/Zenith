import { Suspense } from "react";
import Link from "next/link";
import { Info, Lock } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayET } from "@/lib/market-calendar";
import { AnalysisList, type AnalysisListItem } from "@/components/ai/AnalysisList";
import { AnalysisShell } from "@/components/ai/AnalysisShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { PRO_PRICE_MONTHLY } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Pro-gated upgrade teaser. Adapts the CTA to whether the visitor is signed in:
// guests get a signup funnel, free accounts get the upgrade funnel. The page reads
// via the admin client (bypasses RLS), so gating MUST happen before any data read.
function AnalysisTeaser({ signedIn }: { signedIn: boolean }) {
  return (
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
              className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
            >
              Upgrade to Pro · {PRO_PRICE_MONTHLY}
            </Link>
          ) : (
            <>
              <Link
                href="/auth/signup?next=/analysis"
                className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.03]"
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
  );
}

// The day cap in generateAndStoreTopAnalyses makes a day at most 5 rows, so 12
// covers the latest session plus a full spare one. That slack is what lets the
// "latest date, then that date's rows" pair collapse into ONE round trip: take
// the newest date off the first row and filter to it, instead of asking the
// database for the date and then asking again for the rows.
const LOOKBACK_ROWS = 12;

/**
 * Dated incident notice for the 2026-09-15 RFAI thesis — scored 9/10 at +26.1%
 * intraday, closed +13.5%, then traded +30.4% the next session.
 *
 * TEMPORARY. Remove around 2026-09-30; this is an acknowledgement, not furniture.
 *
 * Lives in the Pro branch of <AnalysisPanel>, NOT in <AnalysisShell>: the shell
 * also wraps <AnalysisTeaser>, so putting it there showed the apology to logged-out
 * and free visitors directly above the upgrade CTA — an audience that never saw the
 * RFAI thesis, since theses and the pre-close email are both Pro-gated. Costs a
 * paint (it now waits on the same Supabase read the rows do); worth it.
 *
 * Two things about the copy are deliberate:
 *   * It names NO threshold, constant or pipeline stage. Same rule
 *     app/engine/page.tsx states for /engine — "no scoring inputs, no Δ
 *     constants, thresholds, or bucket boundaries from score.ts". An earlier
 *     draft spelled out the 35% floor; do not reintroduce it.
 *   * The closing line stays. Without it this reads as a promise that a top
 *     score can no longer lose, which the change does not support — it caps the
 *     confidence, not the pick, and RFAI itself would still have been a 7/10.
 *     That is also not a claim to make under lib/legal.ts NOT_ADVICE.
 *   * "guard against a repeat", not "ensure this does not happen again". The
 *     cap cannot carry the stronger claim: it catches 3 of the 12 worst
 *     drawdowns on record (the worst, USDE at -99.4%, scored 6), and RFAI itself
 *     would still have been a 7/10, i.e. still a short call that still loses
 *     30%. A falsifiable guarantee on a product used by minors is also the one
 *     sentence here that could become a problem under lib/legal.ts NOT_ADVICE.
 *     "To our best ability to guard against" is effort toward an outcome;
 *     "ensure it does not happen again" promises the outcome itself.
 *   * No em dashes, at the user's request (2026-09-16). Keep it that way.
 */
function EngineNotice() {
  return (
    <div className="glass flex gap-3 rounded-2xl p-4 ring-1 ring-brand/20">
      <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">On our September 15 RFAI thesis</p>
        <p className="text-muted-foreground">
          We scored it 9/10 and the trade went against it.
        </p>
        <p className="text-muted-foreground">
          We take these ratings seriously. We have reworked the engine to our best
          ability and will continue to do so to guard against a repeat of this.
        </p>
        <p className="text-muted-foreground">No thesis is a sure thing.</p>
      </div>
    </div>
  );
}

// Everything that touches the database, below the page's <Suspense>.
async function AnalysisPanel() {
  // Shared with <Header> for this request — see lib/viewer.ts.
  const { user, isPro } = await getViewer();
  if (!user) return <AnalysisTeaser signedIn={false} />;
  if (!isPro) return <AnalysisTeaser signedIn />;

  // Latest date that actually has theses (≤ today) — so pre-drop we still show
  // the most recent set rather than an empty page.
  const admin = createAdminClient();
  const today = getTodayET();
  const { data } = await admin
    .from("ai_analyses")
    .select(
      "date, ticker, company_name, exchange, rank, short_score, short_thesis, catalyst, catalyst_type, change_percent_at_score, scored_day_change_percent",
    )
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(LOOKBACK_ROWS);

  const rows = data ?? [];
  const date = rows[0]?.date ?? null;
  const analyses: AnalysisListItem[] = date
    ? rows.filter((r) => r.date === date)
    : [];

  if (analyses.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Today&apos;s short theses post about 30 minutes before the close — check
        back this afternoon to trade at today&apos;s price.
      </div>
    );
  }

  return (
    <>
      {/* Derived from the rows, so it streams with them rather than sitting in
          <PageHeader>'s slot above the boundary. */}
      {date !== today && (
        <p className="glass self-start rounded-full px-3 py-1 font-mono text-xs text-muted-foreground">
          As of {date}
        </p>
      )}
      <EngineNotice />
      <AnalysisList analyses={analyses} />
    </>
  );
}

// SYNCHRONOUS — the awaits live in <AnalysisPanel> behind the boundary, so the
// header paints without waiting on auth or on the thesis rows.
export default function AnalysisPage() {
  return (
    <AnalysisShell>
      <Suspense fallback={<PageSkeleton rows={5} header={false} />}>
        <AnalysisPanel />
      </Suspense>
    </AnalysisShell>
  );
}
