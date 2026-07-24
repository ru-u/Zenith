import { PageSkeleton } from "@/components/layout/PageSkeleton";

export default function HistoryLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <PageSkeleton rows={6} />
    </main>
  );
}
