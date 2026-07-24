import { PageSkeleton } from "@/components/layout/PageSkeleton";

export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <PageSkeleton rows={4} />
    </main>
  );
}
