"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

const TEN_MINUTES = 10 * 60 * 1000;

export function Providers({ children }: { children: React.ReactNode }) {
  // The marketing landing is a dark-only surface (its glow/grain visual
  // language has no light rendition) — force dark there; every other route
  // keeps the user's stored light/dark/system choice. The header hides the
  // theme toggle on "/" to match (ThemeToggleButton).
  const pathname = usePathname();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is delayed/near-real-time; matches the server-side cache window.
            staleTime: TEN_MINUTES,
            // Must be >= staleTime. The default gcTime is FIVE minutes, so a
            // query with no observers was evicted while still fresh: navigate
            // off /screener, come back six minutes later, and a cache that
            // considered itself valid had already been collected — you paid a
            // cold fetch and a full skeleton. That mismatch is why loads felt
            // fast or slow depending on which page you came from.
            gcTime: TEN_MINUTES,
            refetchInterval: TEN_MINUTES,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      forcedTheme={pathname === "/" ? "dark" : undefined}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
