import {
  QueryClient,
  HydrationBoundary,
  dehydrate,
} from "@tanstack/react-query";
import { createAdminClient } from "./supabase/admin";
import { serveStoredGainers } from "./gainers";
import { getTodayET } from "./market-calendar";

/**
 * Server-renders the gainers board into the page instead of letting the
 * browser discover it after hydration.
 *
 * Without this the funnel panel on "/" and the whole screener showed pulse
 * skeletons until HTML → JS → hydrate → fetch had all completed — a long wait
 * on a school network, and the first thing a visitor sees.
 *
 * It reads the DATABASE, not `GET /api/gainers`: that route also refreshes
 * from the provider, freezes the official close, and triggers the pre-close
 * drop, none of which may run from a render. `useGainers` therefore keeps
 * `refetchOnMount: "always"`, so the client still calls the route on mount
 * exactly as before and every one of those side effects still fires — this
 * only changes what's on screen while that happens.
 *
 * A failed read is not fatal: the boundary hydrates nothing and the client
 * falls back to its own fetch, which is today's behavior.
 */
export async function GainersHydration({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient();

  try {
    const payload = await serveStoredGainers(createAdminClient(), getTodayET());
    queryClient.setQueryData(["gainers"], payload);
  } catch (e) {
    console.error("[prefetchGainers]", (e as Error)?.message);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
