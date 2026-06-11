import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HistoryBrowser } from "@/components/history/HistoryBrowser";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/history");

  // One row per finalized day (rank = 1) → distinct dates, newest first.
  const admin = createAdminClient();
  const { data } = await admin
    .from("daily_gainers")
    .select("date")
    .eq("is_final", true)
    .eq("rank", 1)
    .order("date", { ascending: false })
    .limit(60);

  const dates = (data ?? []).map((d) => d.date);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past trading days. Free accounts can browse the last 30 days.
        </p>
      </div>
      <HistoryBrowser dates={dates} />
    </main>
  );
}
