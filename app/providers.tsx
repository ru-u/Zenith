"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
