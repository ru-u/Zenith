import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import { ThemeToggleButton } from "./ThemeToggleButton";
import {
  HeaderUpgrade,
  HeaderUpgradeFallback,
  HeaderAccount,
  HeaderAccountFallback,
} from "./HeaderAccount";

// DELIBERATELY SYNCHRONOUS. This renders in the root layout, so anything it
// awaits blocks the whole document — on every route, above every per-segment
// loading.tsx, which Next nests *inside* the layout rather than around it
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// loading.md). It used to `await getViewer()` here, which put two serial
// Supabase round trips in front of the first byte and, with them, the browser's
// discovery of the stylesheet and the JS bundle.
//
// The bar itself — the sticky box, the border, the blur, the h-14 container, the
// logo, the nav and the theme toggle — needs no auth, so it is shell content and
// flushes immediately. Only the two auth-dependent slots suspend; see
// ./HeaderAccount.tsx for why they are two boundaries and how the fallbacks are
// sized.
export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-foreground/5 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center" aria-label="Zenith home">
          <Logo unique="header" />
        </Link>

        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {/* Text nav collapses on phones — the header otherwise overflows
              narrow viewports and drags the whole page wider. <MobileNav>
              (inside <HeaderAccount>) carries the same routes in a drawer, so
              the phone header is Logo · Upgrade · theme · menu. */}
          <NavLinks />

          <Suspense fallback={<HeaderUpgradeFallback />}>
            <HeaderUpgrade />
          </Suspense>

          {/* Theme toggle — available to everyone, signed in or not, so it sits
              outside the boundaries and paints with the shell. */}
          <ThemeToggleButton />

          <Suspense fallback={<HeaderAccountFallback />}>
            <HeaderAccount />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
