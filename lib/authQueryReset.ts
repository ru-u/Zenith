import type { QueryClient } from "@tanstack/react-query";

// Queries whose results depend on who's signed in. Auth flows navigate
// client-side (router.push/refresh), so without this the TanStack cache carries
// the previous identity across a sign-in/out — a guest's `favorites: null` would
// stick after login, and one user's favorites/streaks would linger after sign-out.
// Called from the login, signup, and sign-out handlers before navigating.
const AUTH_SCOPED_KEYS = [["favorites"], ["streaks"], ["ai-analysis"]] as const;

export function resetAuthQueries(queryClient: QueryClient) {
  for (const queryKey of AUTH_SCOPED_KEYS) {
    queryClient.removeQueries({ queryKey });
  }
}
