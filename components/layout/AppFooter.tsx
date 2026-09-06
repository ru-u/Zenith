import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, NOT_ADVICE, NOT_AFFILIATED } from "@/lib/legal";
import { LINKS } from "@/lib/nav";
import { NavPending } from "./NavPending";

// The app-side legal footer. Until this existed, <LandingFooter> was the only
// footer in the product and it renders on "/" alone — so /screener, /analysis,
// /history and /settings carried no disclaimer and no DECA non-affiliation line
// at all. Mounted in the root layout (rather than added page by page) so every
// route added later inherits it by default.
//
// "/" already ends in <LandingFooter>, which carries the same two lines in the
// marketing footer's own styling — <HideOnLanding> in the root layout does that
// check, so this stays a server component.
export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-foreground/5">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">{NOT_ADVICE}</strong>{" "}
          {NOT_AFFILIATED} DECA and The Stock Market Game are trademarks of their
          respective owners. Zenith does not execute trades. Market data may be
          delayed or incomplete.
        </p>
        {/* The app's own routes, repeated here because the header's text nav
            is hidden on phones. The drawer is the primary path; this is a
            second one that costs nothing. */}
        <nav
          aria-label="Site"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        >
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="relative py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
              <NavPending />
            </Link>
          ))}
          {/* Not in LINKS on purpose: that array also drives the header nav and
              the phone drawer, and the ticker index is a crawl entry point
              rather than a fourth primary route. Same treatment /engine gets —
              findable, not promoted. */}
          <Link
            href="/stock"
            className="relative py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            Tickers
          </Link>
          <Link
            href="/learn"
            className="relative py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            Learn
          </Link>
        </nav>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        >
          <Link
            href="/privacy"
            className="py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms &amp; Conditions
          </Link>
          <Link
            href="/engine"
            className="py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            The Engine
          </Link>
          <Link
            href="/cookies"
            className="py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            Cookie Policy
          </Link>
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </nav>
      </div>
    </footer>
  );
}
