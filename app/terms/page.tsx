import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The rules for using Zenith: eligibility, subscriptions, disclaimers, and how Zenith relates to the DECA Stock Market Game.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms &amp; Conditions"
      description="Plain-language terms. The parts that matter most: Zenith is a research tool for a simulated game, it is not investment advice, and your competition's rules are yours to follow."
      unique="terms"
    >
      <LegalSection title="1. Agreement">
        <p>
          These terms are a contract between you and Zenith (&quot;we&quot;,
          &quot;us&quot;) covering the Zenith website and services. By creating
          an account or using the site you accept them. If you do not accept
          them, do not use Zenith.
        </p>
      </LegalSection>

      <LegalSection title="2. Who may use Zenith">
        <p>
          You must be at least 13 years old. If you are under 18, you may use
          Zenith only with the permission of a parent or guardian, and a Pro
          subscription must be purchased by, or with the consent of, a parent
          or guardian who accepts these terms on your behalf.
        </p>
      </LegalSection>

      <LegalSection title="3. What Zenith is">
        <p>
          Zenith is an educational research tool. It ranks each trading
          day&apos;s biggest US stock market gainers, tracks consecutive-day
          streaks, and publishes automated analysis (&quot;short theses&quot;)
          about them, timed to the DECA Stock Market Game&apos;s end-of-day
          trading deadline. Zenith does not execute trades anywhere, real or
          simulated.
        </p>
      </LegalSection>

      <LegalSection title="4. Not investment advice">
        <p>
          Everything on Zenith, including the short theses, scores, and
          risk labels, is educational analysis about a simulated trading
          competition. It is <strong>not investment advice</strong>, not a
          recommendation to buy, sell, or short any real security, and not an
          offer of brokerage, advisory, or fiduciary services. Do not use
          Zenith to make real-money investment decisions. Markets are risky and
          short selling in real life can lose more than you put in.
        </p>
      </LegalSection>

      <LegalSection title="5. Zenith and DECA">
        <p>
          Zenith is an independent product. It is{" "}
          <strong>
            not affiliated with, endorsed by, or connected to DECA Inc. or the
            SIFMA Foundation
          </strong>
          , which operate the DECA Stock Market Game. DECA, The Stock Market
          Game, and related marks belong to their owners; we reference them
          only to describe what Zenith is for.
        </p>
      </LegalSection>

      <LegalSection title="6. Your competition's rules are your responsibility">
        <p>
          The DECA Stock Market Game is governed by the SIFMA Foundation&apos;s
          Program Rules and Code of Participation and by DECA&apos;s event
          guidelines. You are responsible for knowing and following them.
          Zenith is designed to be a research aid, like reading a finance
          site, but the rules you compete under are between you, your advisor,
          DECA, and the SIFMA Foundation. In particular:
        </p>
        <ul>
          <li>
            DECA&apos;s guidelines require that{" "}
            <strong>each team completes its own research</strong>{" "}
            and that portfolios are distinct and reflect the team&apos;s own strategy.
            Treat Zenith&apos;s output as one input to your own thinking, not
            as your strategy.
          </li>
          <li>
            DECA&apos;s written events require a signed{" "}
            <strong>Statement of Assurances and Academic Integrity</strong>{" "}
            and a bibliography. If Zenith&apos;s analysis informs a written entry
            or presentation, cite it as a source. Do not present Zenith&apos;s
            text as your own writing.
          </li>
          <li>
            Zenith does not guarantee that any stock it lists is tradeable or
            shortable under the game&apos;s rules (for example the game&apos;s
            $3 minimum price on the prior day, $25 million minimum market cap,
            and its right to block or unwind trades in extremely volatile
            stocks). Check the game&apos;s rules before placing an order.
          </li>
        </ul>
        <p>
          We may suspend accounts that use Zenith to violate competition rules,
          and we accept no responsibility for rankings, penalties, or
          disqualifications in any competition.
        </p>
      </LegalSection>

      <LegalSection title="7. Accounts">
        <p>
          Keep your login credentials private and tell us if you believe your
          account has been compromised. You are responsible for activity under
          your account. Provide a real email address; it is how we deliver the
          product and reach you about your account.
        </p>
      </LegalSection>

      <LegalSection title="8. Pro subscriptions and billing">
        <ul>
          <li>
            Zenith Pro costs <strong>$9.99 per month</strong>, billed through
            Stripe, and renews automatically each month until canceled.
          </li>
          <li>
            If you subscribed before September 1, 2026, you keep the price you
            signed up at ($4.99 per month) for as long as your subscription
            stays active. Canceling and resubscribing later starts a new
            subscription at the current price.
          </li>
          <li>
            You can cancel any time from Settings (via the Stripe billing
            portal). Cancellation takes effect at the end of the current
            billing period; you keep Pro access until then.
          </li>
          <li>
            We do not refund partial months, except where the law requires it.
          </li>
          <li>
            If the price changes, we will notify you by email at least 30 days
            before it affects you.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Acceptable use">
        <p>
          Zenith is for your personal use. Do not scrape the site or its data
          at scale, systematically republish or resell Pro content, share
          accounts to circumvent the Pro gate, probe or disrupt the service, or
          use Zenith for anything unlawful. Quoting a thesis with attribution
          in your own schoolwork or DECA entry is fine and encouraged.
        </p>
      </LegalSection>

      <LegalSection title="10. Data and analysis accuracy">
        <p>
          Market data comes from third-party sources and may be delayed,
          incomplete, or wrong. The theses are produced by an automated system;
          they can be wrong, and a stock that looks like a short can keep
          going up. Zenith is provided &quot;as is&quot;, and we make no
          promises about accuracy, availability, or fitness for any purpose.
          Verify anything you rely on.
        </p>
      </LegalSection>

      <LegalSection title="11. Intellectual property">
        <p>
          Zenith&apos;s software, design, and content belong to us or our
          licensors. We grant you a personal, non-transferable license to use
          the service. You may quote Zenith&apos;s analysis in your own
          non-commercial work (including competition entries) with attribution.
        </p>
      </LegalSection>

      <LegalSection title="12. Termination">
        <p>
          You can stop using Zenith or ask us to delete your account at any
          time. We may suspend or terminate accounts that break these terms,
          and we may discontinue the service; if you have paid for time you do
          not receive because we shut the service down, we will refund it.
        </p>
      </LegalSection>

      <LegalSection title="13. Limitation of liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect,
          incidental, or consequential damages, including competition results,
          lost data, or decisions made from the analysis. Our total liability
          for any claim is capped at the amount you paid us in the twelve
          months before the claim, or $10 if you have paid nothing.
        </p>
      </LegalSection>

      <LegalSection title="14. Changes and contact">
        <p>
          We may update these terms; the date at the top reflects the latest
          version, and material changes will be announced by email to account
          holders. Continuing to use Zenith after a change means you accept the
          new terms. Questions:{" "}
          <a className="text-brand" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . See also the{" "}
          <Link className="text-brand" href="/privacy">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link className="text-brand" href="/cookies">
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
