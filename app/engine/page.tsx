import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { ENGINE_UPDATED, LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { activeProseMode } from "@/lib/quant/thesis";

export const metadata: Metadata = {
  title: "The Engine",
  description:
    "What Zenith's engine does and doesn't claim: the one-day basis, what the score means, what AI touches, and where it gets things wrong.",
};

// Disclosure, not a marketing page. Two jobs: give a curious student an honest
// account of where the numbers come from, and make sure nobody can say the
// limitations weren't disclosed. Public on purpose — a methodology page gated
// behind Pro protects nobody, since the people most likely to misread a
// "Short 8/10" are the ones who haven't paid.
//
// Deliberately NOT in the header nav and NOT high-priority in the sitemap: it
// should be findable, not promoted.
//
// Rule for editing (tightened 2026-08-26 at the user's call): this page states
// what the output IS and ISN'T. It does NOT explain the method. An earlier draft
// walked through the pipeline step by step (EDGAR → base-rate buckets →
// technicals → score) and listed the catalyst caps; that was cut as leaking the
// quant process. Keep it that way — no pipeline stages, no scoring inputs, no
// Δ constants, thresholds, or bucket boundaries from score.ts.
//
// Also: no win-rate or backtest number here until the September backtest exists
// (and then only the one aggregate stat, per the roadmap's trust call — never
// per-thesis outcomes).
export const dynamic = "force-dynamic"; // renders the live AI_PROSE_MODE state

export default function EnginePage() {
  // Read the real mode rather than describing an intended one. When Haiku is
  // switched on in September this page starts telling the truth by itself,
  // instead of quietly becoming the overclaim we removed from the pricing copy.
  const haikuLive = activeProseMode() === "haiku";

  return (
    <LegalShell
      eyebrow="Engine"
      title="The Engine"
      description="What the engine claims, what it doesn't, and where it gets things wrong. Written for anyone curious about what's behind a thesis."
      unique="engine"
      updated={ENGINE_UPDATED}
    >
      <LegalSection title="The short version">
        <p>
          Zenith ranks the day&apos;s biggest US stock-market gainers and
          publishes a short thesis on the top five, about 30 minutes before the
          4:00 PM ET close. The ranking and the scores are{" "}
          <strong>computed from market data</strong> — filings, historical
          outcomes, statistical models, price and volume — not written by a chatbot. Zenith places
          no trades and holds no positions.
        </p>
        <p>
          Zenith can also be wrong. Its limitations
          are set out below and should be read before relying on anything it
          publishes.
        </p>
      </LegalSection>

      <LegalSection title="Everything is a one-day, close-to-close question">
        <p>
          The engine answers exactly one question about each stock:{" "}
          <strong>
            will it close lower at the next close than it did at this one?
          </strong>{" "}
          Close to close, roughly 4:00 PM ET to 4:00 PM ET, one session. Nothing
          on Zenith is a view on where a stock goes over a week, a month, or the
          rest of the competition.
        </p>
        <p>
          That basis comes from how the Stock Market Game actually fills orders.
          It is an end-of-day game: an order placed during market hours fills at{" "}
          <em>that day&apos;s</em> closing price, and an order placed after the
          close fills at the <em>next</em> day&apos;s close. Orders stay pending
          and cancelable until then.
        </p>
        <p>
          Two things follow. A thesis is only useful if it reaches you before
          the close, which is why it lands at 3:30 rather than after the bell.
          And only the regular session counts — pre-market and after-hours moves
          never become a fill price, so the engine ignores them.
        </p>
      </LegalSection>

      <LegalSection title="Why the drop lands at 3:30">
        <p>
          The theses post about half an hour before the close. That is a
          scheduling decision, not a trading one —{" "}
          <strong>
            we are not saying 3:30 is or is not a good moment to short a stock
          </strong>
          , and there is nothing special about the price at 3:30.
        </p>
        <p>
          It is a compromise between two things that pull against each other.
          Late in the session the day&apos;s biggest gainers have mostly
          settled, so the list at 3:30 is usually close to the list at 4:00;
          earlier in the day it isn&apos;t, and names trade places constantly.
          But your order still has to be in before the close to fill at
          today&apos;s price. Half an hour leaves room to read five theses and
          place an order without cutting it fine.
        </p>
        <p>
          Nothing is settled at 3:30. Stocks move in the last half hour, and the
          ranking can still change before the bell.
        </p>
      </LegalSection>

      <LegalSection title="What the score is">
        <p>
          Each thesis carries a short score from 1 to 10. It ranks the
          day&apos;s candidates against one another. It is{" "}
          <strong>not a probability and not a confidence level</strong> — an
          8/10 does not mean an 80% chance of anything, and a 9 sitting next to
          a 3 says the engine prefers one to the other, not that either is a
          good idea.
        </p>
        <p>
          Where a thesis quotes figures from past cases, those describe how a
          group of similar past spikes behaved. They are not predictions about
          the stock in front of you.
        </p>
      </LegalSection>

      <LegalSection title="What AI does, and does not, do">
        <p>
          {haikuLive ? (
            <>
              A language model is currently used for <strong>one thing</strong>:
              rewriting the finished findings into readable sentences. It
              receives the numbers the engine already computed and is instructed
              not to change or add to them.
            </>
          ) : (
            <>
              <strong>
                No AI model is involved in the theses at all right now.
              </strong>{" "}
              Scores and wording are both produced by the engine described
              above. If we later switch on a model to improve the phrasing, its
              only job will be rewriting findings the engine already computed,
              and this page will say so.
            </>
          )}
        </p>
        <p>In neither case does a model:</p>
        <ul>
          <li>choose which stocks appear on the screener or in the top five</li>
          <li>produce or adjust the short score, the base rate, or any figure</li>
          <li>look anything up, browse the web, or add facts of its own</li>
        </ul>
        <p>
          Nothing about you is ever sent to an AI provider. See the{" "}
          <Link className="text-brand" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="The engine gets things wrong">
        <p>
          Nobody can predict what a stock will do tomorrow, and this engine
          doesn&apos;t either. It estimates, from history, how situations like
          this one have tended to resolve. Situations that historically resolved
          one way still resolve the other way often — that is what a probability
          means. Expect losing calls, including on high-scoring ones.
        </p>
        <p>
          A stock that has already risen sharply can keep rising, and often
          does. Historical patterns can also stop describing the market in front
          of them. Treat a thesis as one input to your own judgement rather than
          a conclusion to act on.
        </p>
      </LegalSection>

      <LegalSection title="Data, and how it lies">
        <p>
          Prices, volume and company details come from a third-party market data
          source. Filing information comes from the SEC&apos;s EDGAR system, and
          headlines from a news provider. All of it can be delayed, incomplete,
          or wrong, and the engine has to work around several known problems:
        </p>
        <ul>
          <li>
            <strong>Stock splits.</strong> On the day a split takes effect,
            percentage changes can be computed against the pre-split price,
            manufacturing enormous fake gains. Moves with that signature are
            dropped.
          </li>
          <li>
            <strong>Halted stocks.</strong> A stock halted from trading keeps
            reporting the same values day after day. Rows that repeat exactly
            are dropped rather than presented as a live mover.
          </li>
          <li>
            <strong>Ticker symbols aren&apos;t unique.</strong> The same few
            letters can refer to different instruments on different venues, and
            symbols get reused when companies leave the market. Every symbol is
            qualified with its exchange before it&apos;s looked up or charted,
            and if a symbol can&apos;t be matched confidently the row is dropped
            and the filing check returns nothing rather than the wrong
            company&apos;s documents.
          </li>
        </ul>
        <p>
          These guards are imperfect. If a listing looks wrong, it may be — tell
          us at{" "}
          <a className="text-brand" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="What's covered">
        <p>
          The screener looks at common stock on the NASDAQ and NYSE, priced at
          $3 or more, with a market value of at least $25 million, ranked by
          percentage gain over the regular session. No over-the-counter stocks.
        </p>
        <p>
          The price and size floors are set where they are because the Stock
          Market Game applies similar limits to what you may trade. They are not
          a promise: the game also reserves the right to block or unwind trades
          in unusually volatile stocks, and its rules govern, not ours. Check
          before you place an order.
        </p>
      </LegalSection>

      <LegalSection title="Using this in your competition">
        <p>
          Zenith is a research aid — a screener plus analysis, like reading a
          finance site before you trade. You place your own trades in the
          official game. A few things are your responsibility, and they matter:
        </p>
        <ul>
          <li>
            DECA expects <strong>each team to do its own research</strong>, with
            a portfolio that reflects its own strategy. Treat a thesis as one
            input to your thinking, not as your strategy.
          </li>
          <li>
            If Zenith&apos;s analysis informs a written entry or a presentation,{" "}
            <strong>cite it as a source</strong>. Written events require a
            signed academic-integrity statement and a bibliography. Do not
            present Zenith&apos;s text as your own writing.
          </li>
          <li>
            Rules vary by chapter and by event. Yours are between you, your
            advisor, DECA, and the SIFMA Foundation — check them if you&apos;re
            unsure.
          </li>
        </ul>
        <p>
          The full version is in the{" "}
          <Link className="text-brand" href="/terms">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Not investment advice">
        <p>
          Everything on Zenith — the rankings, the theses, the scores, the risk
          labels — is educational analysis about a{" "}
          <strong>simulated trading competition</strong>. It is{" "}
          <strong>not investment advice</strong>, not a recommendation to buy,
          sell, or short any real security, and not an offer of brokerage or
          advisory services. Do not use Zenith to make real-money decisions.
          Short selling with real money can lose more than you put in.
        </p>
        <p>
          Zenith is not affiliated with, endorsed by, or connected to DECA Inc.
          or the SIFMA Foundation.
        </p>
        <p>
          Questions about anything here:{" "}
          <a className="text-brand" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
