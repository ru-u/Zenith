import { cache } from "react";
import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { getViewer } from "@/lib/viewer";

// Server-side seed for the ["viewer"] query, so <ChartDialog>'s Pro gate is
// resolved from the document instead of a browser→Supabase round trip on mount.
// See hooks/useSubscription.ts for what this replaced.
//
// NOTE THE CONTRAST WITH lib/gainersSeed.ts, which is the more surprising of the
// two: that one is seeded with `updatedAt: 0` so the client ALWAYS refetches,
// because the write path (the intraday refresh, the close capture, the warm-up
// probe) hangs off that first client request. Nothing hangs off this one, so it
// takes a real `updatedAt` and the client does not refetch — which is the whole
// point. Do not "make them consistent"; the difference is load-bearing in both
// directions.
//
// Free because getViewer() is cache()d per request and <Header> has already
// called it by the time a page renders.
export const dehydratedViewer = cache(async (): Promise<DehydratedState> => {
  const { user, isPro } = await getViewer();
  const queryClient = new QueryClient();
  queryClient.setQueryData(["viewer"], { signedIn: !!user, isPro });
  return dehydrate(queryClient);
});
