"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/useMounted";

// Compact light/dark switch for the header — available to everyone, no auth
// required (theme persists in localStorage). The full 3-way control (incl.
// System) lives in the user menu and Settings.
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const pathname = usePathname();

  // The landing ("/") is pinned dark (forcedTheme in app/providers.tsx) —
  // a toggle that appears to do nothing there would just read as broken.
  if (pathname === "/") return null;

  const isDark = resolvedTheme === "dark";
  // Until mounted, resolvedTheme is unknown on the server, so keep every
  // theme-dependent attribute static — otherwise server ("dark") and client
  // ("light") markup disagree and React throws a hydration mismatch.
  const label = mounted
    ? `Switch to ${isDark ? "light" : "dark"} mode`
    : "Toggle theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        className,
      )}
    >
      {/* Render an invisible placeholder until mounted so the icon doesn't
          flip during hydration (resolvedTheme is client-only). */}
      {mounted && !isDark ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className={cn("h-4 w-4", !mounted && "opacity-0")} />
      )}
      <span className="sr-only">Toggle light or dark mode</span>
    </button>
  );
}
