import { PageSkeleton } from "@/components/layout/PageSkeleton";

export default function AnalysisLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <PageSkeleton rows={5} />
    </main>
  );
}
