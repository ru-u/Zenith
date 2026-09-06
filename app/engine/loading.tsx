import { PageSkeleton } from "@/components/layout/PageSkeleton";

// Matches <LegalPage>'s shell (components/legal/LegalPage.tsx), which /engine
// renders through — same max-width and padding, so the fallback and the page
// occupy the same box. Like /upgrade, this route is force-dynamic and had no
// loading.tsx, which meant its prefetch was skipped outright.
export default function EngineLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <PageSkeleton rows={5} />
    </main>
  );
}
