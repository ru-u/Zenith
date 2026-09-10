import Link from "next/link";
import { Check } from "lucide-react";
import { AmbientChevrons } from "./AmbientChevrons";
import { Reveal } from "./Reveal";
import { StreakBadge } from "@/components/gainers/StreakBadge";
import { ZenithMark } from "@/components/layout/Logo";
import { PRO_PRICE_MONTHLY, TIER_FEATURES } from "@/lib/pricing";

/**
 * The Pro pitch, shown around one hardcoded EXAMPLE thesis (fictional ticker).
 * Real theses live behind Pro-only RLS, so nothing here pretends to be live.
 *
 * The card MIRRORS components/ai/AnalysisList.tsx — the only component in the app
 * that renders a real `short_thesis` — element for element and class for class:
 * header (#short-rank, ticker, company, score pill), "Why it spiked:", then one
 * unclamped paragraph. It used to show a "High risk" badge, a "Key catalysts"
 * bullet list and a "Setup:" callout, none of which exist: `risk_level`,
 * `key_catalysts`, `recommendation` and `invalidation` are deprecated columns that
 * lib/claude.ts stopped writing and no surface reads (see supabase/migrate.sql).
 * Selling a format the product doesn't ship is false marketing for a paid feature,
 * so anything added here must exist on a real card first.
 *
 * The prose is assembled from the engine's own verbatim strings — describe()
 * in lib/quant/edgar.ts for the catalyst, BEHAVIOR.offering /
 * levelContextSentence / expectedMoveSentence in lib/quant/thesis.ts, and
 * formatBaseRatePrior in lib/baseRates.ts — with illustrative figures. That is
 * why it is figure-dense and ends on the expected-move line.
 *
 * Every number in it traces to one the engine actually computes, so the text
 * would pass ungroundedNumbers(): 64.2 is change_percent, 38 comes from
 * chart_context, and the rest live inside the pinned sentences. A first draft
 * invented "a $45 million registered direct offering" — the engine never
 * extracts a raise size from EDGAR, so that figure would have been discarded in
 * model mode. Do not add a figure here without a field behind it.
 *
 * The catalyst is an OFFERING on purpose: the old "low-float squeeze" framing is
 * catalyst_type `meme_squeeze`, which lib/quant/score.ts caps at 4/10, so it could
 * never carry the score the pill shows. Offering is also the only class whose
 * BEHAVIOR line is fade-friendly AND uncapped — buyout caps at 2, macro at 4, and
 * earnings/regulatory/partnership all read as cautionary.
 *
 * The offering and the 3-day streak are consistent, not in tension:
 * LOOKBACK_TRADING_DAYS in edgar.ts is 3, the same span as the streak, so a
 * filing from day 1 of a run is still the catalyst on day 3 — dilution sold into
 * strength, which is the setup the screener exists to catch.
 *
 * The "Sep 8" in the catalyst line ages; the engine always stamps a date
 * (shortDate in edgar.ts), so dropping it would be less faithful. Refresh it if
 * it ever reads stale.
 *
 * Two deliberate divergences from AnalysisList — do not "fix" them back:
 *   - the `+64.2%` in the header. AnalysisList has no standalone gain (it shows a
 *     post-finalize "Scored at +X% · closed ±Y%" line instead, omitted here rather
 *     than invent a favourable outcome for a stock that doesn't exist). Every other
 *     Zenith surface pairs a ticker with its gain, and the gain is what the thesis
 *     is about.
 *   - the StreakBadge. Thesis cards carry no streak chip; the board and TopFive do.
 *     Note there is deliberately no streak SENTENCE in the prose to match it —
 *     pinnedSentences() omits it and production runs AI_PROSE_MODE=model, so
 *     chip-without-sentence is what a Pro user actually reads.
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
            of the day&apos;s top five — every figure computed by a quant engine
            from public market data, with AI used only to phrase the findings —
            posted at 3:30 before the close.
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
            Get Pro · {PRO_PRICE_MONTHLY}
          </Link>
        </div>

        {/* Example thesis card — mirrors components/ai/AnalysisList.tsx. */}
        <div>
          <div className="relative rounded-2xl bg-white/3 p-6 shadow-[0_0_80px_-30px] shadow-brand/30 ring-1 ring-white/8 backdrop-blur-sm">
            {/* Header: #short-rank · ticker · gain · company | streak · score */}
            <div className="flex items-start justify-between gap-3">
              <p className="flex min-w-0 items-baseline gap-2.5 text-lg font-semibold tracking-tight">
                <span className="font-mono text-xs font-medium text-muted-foreground/70 tabular-nums">
                  #1
                </span>
                <span className="min-w-0">
                  QNTM
                  <span className="ml-2 font-mono text-sm font-bold text-up tabular-nums">
                    +64.2%
                  </span>
                  {/* Own line under the ticker on mobile: inline, the name wraps
                      mid-phrase and the second half runs under the pills. */}
                  <span className="block text-sm font-normal text-muted-foreground sm:ml-2 sm:inline">
                    Quantum Compute Corp
                  </span>
                </span>
              </p>
              <span className="flex shrink-0 items-center gap-1.5">
                <StreakBadge count={3} />
                <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                  Short 7/10
                </span>
              </span>
            </div>

            {/* Why it spiked — verbatim describe("offering") from
                lib/quant/edgar.ts. The engine never extracts a raise SIZE from
                EDGAR, so a dollar figure here would be a number the product
                cannot produce (and ungroundedNumbers() would discard). */}
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Why it spiked: </span>
              QNTM is selling new shares — a 424B5 filed with the SEC Sep 8 shows
              a dilutive stock offering / capital raise.
            </p>

            {/* Thesis — model-mode shape: narrative sentences, then the two
                pinned figure-bearing ones verbatim. The narrative leads with the
                day's move because PROSE_SYSTEM requires it ("Always say how far
                the stock moved today, using change_percent"). Every figure here
                traces to one the engine computes, so this text would survive
                ungroundedNumbers(): 64.2 is change_percent, 38 comes from
                chart_context, and the rest sit inside the pinned sentences. */}
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              QNTM is up 64.2% today, its third straight day on the board, even
              though the company is raising cash by selling new stock into the
              run. Pops tied to share offerings usually fade once the dilution
              sinks in, which makes this a fade-friendly setup. On the chart this
              is a recovery, not a breakout — it&apos;s climbing back into a
              range it already traded this quarter, still ~38% below that prior
              peak. Historical base rate (~1yr of micro-cap, relvol 20–100,
              wide-range gainers, n=64): closed LOWER the next session 68% of the
              time, median next-day move -4.2%. Sizing the payoff: when this
              setup fades it typically gives back ~11.3%, and when it keeps
              running it typically adds ~9.8% — netting out to an expected -4.5%
              next-day move in the short&apos;s favor.
            </p>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Illustrative example — fictional ticker, real thesis format.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
