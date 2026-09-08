import { PageHeader } from "@/components/layout/PageHeader";

/**
 * The chrome for /analysis, shared by the page and by loading.tsx — same
 * reasoning as components/history/HistoryShell.tsx: the <h1> is shell content
 * and must not wait on a Supabase round trip, and a cold navigation should show
 * the same header the streamed render does.
 *
 * Note there is no `headerSlot`: the "As of {date}" chip is derived from the
 * thesis rows, so it cannot live above the boundary. It renders inside the
 * streamed panel instead.
 */
export function AnalysisShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <PageHeader
        eyebrow="The 3:30 drop"
        title="Short theses"
        description="The full next-day short analysis for today's top movers, ranked best→worst short."
        unique="analysis"
      />
      {children}
    </main>
  );
}
