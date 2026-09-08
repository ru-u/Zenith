import { AnalysisShell } from "@/components/ai/AnalysisShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

// Renders the SAME chrome as the page — see components/ai/AnalysisShell.tsx.
export default function AnalysisLoading() {
  return (
    <AnalysisShell>
      <PageSkeleton rows={5} header={false} />
    </AnalysisShell>
  );
}
