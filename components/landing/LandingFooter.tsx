import Link from "next/link";
import { AmbientChevrons } from "./AmbientChevrons";
import { Logo } from "@/components/layout/Logo";

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/6">
      {/* The ascent motif's last, quietest echo — the page ends where it began. */}
      <AmbientChevrons variant="echo" unique="footer" className="opacity-40" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo unique="footer" />
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <Link
              href="/screener"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Screener
            </Link>
            <Link
              href="#pricing"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="#faq"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              FAQ
            </Link>
            <Link
              href="/auth/login"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Not affiliated with or endorsed by DECA Inc. Zenith is a research tool
          for a simulated trading competition; nothing here is investment
          advice. Market data may be delayed.
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Link
            href="/privacy"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms &amp; Conditions
          </Link>
          <Link
            href="/cookies"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Cookie Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
