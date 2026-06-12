import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayET } from "@/lib/market-calendar";
import { HistoryBrowser } from "@/components/history/HistoryBrowser";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/history");

  // Past trading days = any date before today. We don't gate on is_final
  // because intraday on-demand writes can flip that flag; a date before today
  // is inherently the final record (we never re-fetch past dates).
  // rank = 1 gives one row per date.
  const admin = createAdminClient();
  const today = getTodayET();
  const { data } = await admin
    .from("daily_gainers")
    .select("date")
    .lt("date", today)
    .eq("rank", 1)
    .order("date", { ascending: false })
    .limit(60);

  const dates = (data ?? []).map((d) => d.date);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past trading days. Free accounts can browse the last 5 days.
        </p>
      </div>
      <HistoryBrowser dates={dates} />
    </main>
  );
}
