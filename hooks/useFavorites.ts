"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEY = ["favorites"] as const;

// The favorites query returns:
//   undefined → still loading
//   null      → signed out (guest)
//   Set       → signed in (possibly empty)
// The null/Set distinction comes straight from /api/favorites' guest sentinel,
// so consumers never need useSubscription (which fetches auth per-mount — fatal
// if called by every row's star).
type FavoritesData = Set<string> | null;

async function fetchFavorites(): Promise<FavoritesData> {
  const res = await fetch("/api/favorites");
  if (!res.ok) throw new Error(`favorites request failed: ${res.status}`);
  const json = (await res.json()) as { favorites: string[] | null };
  return json.favorites === null ? null : new Set(json.favorites);
}

// Favorites change only on user action — long stale time, no polling (mirrors
// useStreaks). Toggles keep the cache fresh optimistically.
export function useFavorites() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchFavorites,
    staleTime: 60 * 60 * 1000,
    refetchInterval: false,
  });
}

async function toggleRequest(ticker: string, favorited: boolean): Promise<void> {
  const res = favorited
    ? await fetch("/api/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker }),
      })
    : await fetch(`/api/favorites?ticker=${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `favorite toggle failed: ${res.status}`);
  }
}

// Optimistic add/remove. `favorited` is the target state (true = add).
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticker, favorited }: { ticker: string; favorited: boolean }) =>
      toggleRequest(ticker, favorited),
    onMutate: async ({ ticker, favorited }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<FavoritesData>(KEY);
      // Only signed-in users reach here; a new Set so structural sharing
      // actually re-renders (mutating the cached Set in place would not).
      if (prev instanceof Set) {
        const next = new Set(prev);
        if (favorited) next.add(ticker);
        else next.delete(ticker);
        queryClient.setQueryData<FavoritesData>(KEY, next);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData<FavoritesData>(KEY, ctx.prev);
      }
    },
    // Re-sync with the server even after rapid toggles that may land out of order.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
