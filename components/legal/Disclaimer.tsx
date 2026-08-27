import Link from "next/link";
import { cn } from "@/lib/utils";
import { NOT_ADVICE } from "@/lib/legal";

/**
 * A quiet one-line securities disclaimer, for the few spots where the claim is
 * sharp enough to want it inline: a scored "Short 8/10" on a real, tradeable
 * ticker shown to high-schoolers.
 *
 * Deliberately minimal. <AppFooter> is the primary disclosure and runs on every
 * route, carrying both the not-advice and the DECA non-affiliation lines — so
 * this stays a single sentence and drops the trademark line rather than
 * repeating the footer verbatim halfway up the same page.
 *
 * Not brand-colored and not green: it's legal text, and green is reserved for
 * semantic P&L meaning.
 */
export function Disclaimer({ className }: { className?: string }) {
  return (
    <p
      aria-label="Disclaimer"
      className={cn(
        "px-1 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {NOT_ADVICE}{" "}
      <Link
        href="/terms"
        className="underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Terms
      </Link>
      .
    </p>
  );
}
