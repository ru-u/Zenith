import { HistoryShell } from "@/components/history/HistoryShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

// Renders the SAME chrome as the page, so a cold navigation and the streamed
// render differ only in the panel — see components/history/HistoryShell.tsx.
export default function HistoryLoading() {
  return (
    <HistoryShell>
      <PageSkeleton rows={6} header={false} />
    </HistoryShell>
  );
}
