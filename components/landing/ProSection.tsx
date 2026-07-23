import Link from "next/link";
import { Check } from "lucide-react";
import { AmbientChevrons } from "./AmbientChevrons";
import { Reveal } from "./Reveal";
import { ZenithMark } from "@/components/layout/Logo";
import { TIER_FEATURES } from "@/lib/pricing";

/**
 * The Pro pitch, shown around one hardcoded EXAMPLE thesis (fictional ticker).
 * Real theses live behind Pro-only RLS, so nothing here pretends to be live —
 * the label does the honesty, the format does the selling.
 */
export function ProSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl overflow-hidden px-6 py-20">
      {/* The hero's ascent motif, echoed at whisper opacity behind the card. */}
      <AmbientChevrons variant="echo" unique="pro" className="opacity-70" />
      <Reveal className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.24em] text-brand">
            <ZenithMark className="h-4 w-4" unique="landing-pro" />
            Zenith Pro
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            Why it spiked, and how it looks as a short
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Anyone can see what spiked. Pro adds a written short thesis on each
            of the day&apos;s top five — built by a quant engine from SEC
            filings, base-rate odds, and live technicals, with AI sharpening
            the analysis — posted at 3:30 before the close.
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {TIER_FEATURES.pro.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href={isLoggedIn ? "/upgrade" : "/auth/signup?next=/upgrade"}
            className="mt-7 inline-block rounded-full bg-brand btn-brand px-6 py-3 text-sm font-semibold text-brand-foreground shadow-[0_0_44px_-10px] shadow-brand/80 transition-[transform,box-shadow] hover:scale-[1.03] hover:shadow-brand"
          >
            Get Pro · $4.99/mo
          </Link>
        </div>

        {/* Example thesis card — fictional ticker, clearly labeled. */}
        <div className="relative rounded-2xl bg-white/3 p-6 shadow-[0_0_80px_-30px] shadow-brand/30 ring-1 ring-white/8 backdrop-blur-sm">
          <span className="absolute right-4 top-4 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
            Example
          </span>
          <div className="flex items-baseline gap-2.5">
            <span className="text-lg font-semibold tracking-tight">QNTM</span>
            <span className="font-mono text-sm font-bold text-up tabular-nums">
              +64.2%
            </span>
            <span className="rounded-full border border-down/30 bg-down/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-down">
              High risk
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Quantum Compute Corp · #1 today · 🔥 3-day streak
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Today&apos;s move is a low-float squeeze on a vague partnership
            press release: no revenue attached, third spike this month, and
            volume faded into the afternoon. Day-3 runners in this cap range
            close lower the next day far more often than not.
          </p>
          <div className="mt-4 border-t border-foreground/10 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Key catalysts
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
              <li>· PR with no dollar figures or timeline</li>
              <li>· Float under 10M shares, moves both ways fast</li>
            </ul>
          </div>
          <p className="mt-4 rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium">
            <span className="text-brand">Setup:</span> A stretched move with
            nothing underneath it.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
