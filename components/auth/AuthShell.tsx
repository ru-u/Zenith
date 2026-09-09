import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";
import { Disclaimer } from "@/components/legal/Disclaimer";

/**
 * The shell every auth page shares: backdrop, logo, card, heading, form slot.
 *
 * This markup was copy-pasted byte-for-byte into all four auth pages and
 * differed only in the props below, so any spacing change meant four edits and
 * the pages drifted whenever one was missed.
 *
 * THE CARD GEOMETRY IS LOAD-BEARING BEYOND LOOKS. GoogleIdentityButton derives
 * `AUTH_CARD_WIDTH_PX = 288` as max-w-sm (384) − px-6 (48) − p-6 (48) to size
 * Google's own button, which it renders itself and we cannot restyle. Changing
 * max-w-sm, px-6 or p-6 here without updating that constant desynchronises the
 * Google button from the fields under it.
 */
export function AuthShell({
  variant = "screener",
  unique,
  title,
  subtitle,
  children,
}: {
  variant?: "screener" | "history";
  unique: string;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <AuthBackdrop variant={variant} />
      {/* py-6, not py-16: with justify-center the card is centred anyway, so
          this padding only ever shows up as scroll once the form is taller
          than the viewport — which on a signup form it always is. It was the
          single largest block of empty space on the page (128px). */}
      <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-4">
        <Link
          href="/"
          className="mb-3 flex justify-center"
          aria-label="Zenith home"
        >
          <Logo unique={unique} markClassName="h-8 w-8" />
        </Link>
        <div className="glass-strong auth-card rounded-2xl p-6">
          <h1 className="mb-1 text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
          <Suspense>{children}</Suspense>
        </div>
        {/* <AppFooter> is suppressed on these routes (see HideOnLanding), so
            this is the page's disclosure — both lines, compactly. */}
        <Disclaimer affiliation className="mt-4 text-center" />
      </main>
    </>
  );
}
