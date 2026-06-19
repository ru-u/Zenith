import { cn } from "@/lib/utils";

/**
 * Zenith brand mark — a double chevron (the "ascending to the zenith" motif),
 * drawn as inline SVG so it stays crisp at any size and picks up the brand
 * gradient. `unique` keeps the gradient id collision-free when several marks
 * render on one page.
 */
export function ZenithMark({
  className,
  unique = "default",
}: {
  className?: string;
  unique?: string;
}) {
  const id = `zenith-mark-${unique}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-7 w-7", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="oklch(0.88 0.13 195)" />
          <stop offset="1" stopColor="oklch(0.6 0.12 205)" />
        </linearGradient>
      </defs>
      <path
        d="M4 12.5 L12 5.5 L20 12.5"
        stroke={`url(#${id})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 18.2 L12 11.2 L20 18.2"
        stroke={`url(#${id})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + "ZENITH" wordmark. Use `markOnly` for tight spaces.
 */
export function Logo({
  className,
  markClassName,
  wordmark = true,
  unique = "default",
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
  unique?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ZenithMark className={markClassName} unique={unique} />
      {wordmark && (
        <span className="bg-gradient-to-br from-foreground to-brand bg-clip-text text-lg font-semibold tracking-tight text-transparent">
          Zenith
        </span>
      )}
    </span>
  );
}
