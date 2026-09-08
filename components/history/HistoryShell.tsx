import { PageHeader } from "@/components/layout/PageHeader";

/**
 * The chrome for /history, shared by the page and by loading.tsx.
 *
 * Shared on purpose: the page renders this synchronously and suspends only the
 * data panel inside it, so the <h1> (the LCP element here) is shell content and
 * reaches the browser before any Supabase round trip. loading.tsx renders the
 * identical chrome, so a cold navigation and a streamed render show the same
 * header and differ only in the panel — one continuous load rather than a
 * skeleton-then-chrome jump.
 */
export function HistoryShell({ children }: { children: React.ReactNode }) {
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
