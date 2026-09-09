import Link from "next/link";
import { cn } from "@/lib/utils";
import { NOT_ADVICE, NOT_AFFILIATED } from "@/lib/legal";

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
 * `affiliation` adds the trademark line back, for the one place where that
 * reasoning does NOT hold: the auth pages hide <AppFooter> (it is 196px of
 * chrome on a focused task page), so nothing else on them carries it — and
 * NOT_ADVICE itself names DECA, which is exactly the nominative use lib/legal.ts
 * says the non-affiliation line has to sit near.
 *
 * Not brand-colored and not green: it's legal text, and green is reserved for
 * semantic P&L meaning.
 */
export function Disclaimer({
  className,
  affiliation = false,
}: {
  className?: string;
  affiliation?: boolean;
}) {
  return (
    <p
      aria-label="Disclaimer"
      className={cn(
        "px-1 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {NOT_ADVICE}{affiliation ? ` ${NOT_AFFILIATED}` : ""}{" "}
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
