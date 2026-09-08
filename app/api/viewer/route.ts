import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Who's asking, for the client. Two booleans, nothing identifying.
//
// This exists so useSubscription can be a deduped TanStack query instead of a
// per-mount useEffect that opened its own browser→Supabase socket. It is the
// FALLBACK path: on /screener, /history and /analysis the ["viewer"] key is
// seeded server-side from the same getViewer() the page already ran, so a normal
// load never calls this at all. It covers client-side navigations into a route
// that doesn't seed, and refetches after the staleTime.
//
// No rate limiter: this is strictly cheaper than /api/streaks (it reuses the
// request-memoized getViewer) and is not reachable more often than a navigation.
export async function GET() {
  const { user, isPro } = await getViewer();

  return NextResponse.json(
    { signedIn: !!user, isPro },
    { headers: { "cache-control": "no-store" } },
  );
}
