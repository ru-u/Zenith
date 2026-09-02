"use client";

import { Star } from "lucide-react";
import { usePathname } from "next/navigation";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useSignupPromptStore } from "@/stores/signupPromptStore";
import { cn } from "@/lib/utils";

// The star toggle shared by the screener rows, hero cards, and the chart's
// metadata bar. Every host is inside a click target that opens the chart, so
// the handler stops propagation. Guests open the dismissible signup prompt
// (not a full-page nav); signed-in users toggle optimistically via the shared
// cache.
//
// `revealOnHover` hides the star until the parent row/card is hovered or
// focused (favorited stars always stay visible) — this is how the list stays
// calm. The chart-bar star omits it, so it's always shown. Hover-reveal relies
// on an ancestor with the `group` class.
//
// The reveal is gated on `pointer-fine:` because a touch device never hovers:
// the star sat at opacity-0 forever on a phone, and since tapping the row opens
// the chart instead, favoriting from the list was simply impossible there. On a
// coarse pointer it is always visible, and a `before:` overlay widens the
// 18px hit area to a thumb-sized one without disturbing the row's layout.
export function FavoriteStar({
  ticker,
  revealOnHover = false,
  className,
}: {
  ticker: string;
  revealOnHover?: boolean;
  className?: string;
}) {
  const { data } = useFavorites();
  const toggle = useToggleFavorite();
  const openPrompt = useSignupPromptStore((s) => s.open);
  const pathname = usePathname();

  const signedIn = data instanceof Set;
  const favorited = signedIn && data.has(ticker);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation(); // don't open the chart; also covers keyboard Enter/Space
    if (data === undefined) return; // still loading
    if (data === null) {
      openPrompt(pathname || "/screener");
      return;
    }
    toggle.mutate({ ticker, favorited: !favorited });
  }

  const label = !signedIn
    ? `Sign up to favorite ${ticker}`
    : favorited
      ? `Remove ${ticker} from favorites`
      : `Add ${ticker} to favorites`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={favorited}
      aria-label={label}
      title={label}
      className={cn(
        "relative shrink-0 rounded-md p-0.5 transition-[color,transform,opacity] duration-200 hover:scale-110 hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:scale-90",
        // Thumb-sized hit area on touch. An overlay rather than real padding:
        // padding would reflow the rank column and the chart's meta bar. Kept
        // to -inset-y-2 so it can't reach into the rows above and below.
        "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-3 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-['']",
        // Idle icon color (overridden by the gradient stroke when favorited):
        // fainter in the list (hover-revealed), stronger for the always-on
        // chart-bar star so it's noticeable on touch.
        favorited
          ? "text-brand"
          : revealOnHover
            ? // /40 reads as "there if you look" under a hover reveal. On touch
              // it's permanently on screen and has to be legible on its own.
              "text-muted-foreground/40 pointer-coarse:text-muted-foreground/70"
            : "text-muted-foreground/70",
        // Hidden at rest on pointer devices; revealed on row/card hover or
        // keyboard focus. A favorited star ignores this and stays visible so
        // the pinned block is scannable. Opacity (not display) keeps the ticker
        // column aligned. Touch devices skip the hiding entirely — see above.
        revealOnHover &&
          !favorited &&
          "pointer-fine:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        className,
      )}
    >
      {/* Favorited = an unfilled star whose outline is the signature
          cyan→polar-white gradient (the shared #streak-grad def in the root
          layout) — the exact treatment of the streak-badge flame, so the two
          read as a set. Idle/hover stars keep a plain currentColor outline. */}
      <Star
        className="h-3.5 w-3.5"
        style={favorited ? { stroke: "url(#streak-grad)" } : undefined}
      />
    </button>
  );
}
