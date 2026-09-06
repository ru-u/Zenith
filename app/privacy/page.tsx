import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What data Zenith collects, how it is used, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Privacy Policy"
      description="What we collect, why, and the choices you have. The short version: an email address, a subscription tier, and nothing we can sell."
      unique="privacy"
    >
      <LegalSection title="Who we are">
        <p>
          Zenith (&quot;we&quot;, &quot;us&quot;) is a stock screener and
          research tool built for participants in the DECA Stock Market Game.
          This policy explains what personal data we collect when you use the
          site, how we use it, and how to reach us. Questions or requests:{" "}
          <a className="text-brand" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <p>
          You can browse the screener without an account, and in that case we
          collect no personal data beyond ordinary server logs.
        </p>
        <ul>
          <li>
            <strong>Account data.</strong> If you create an account: your email
            address and a password. Authentication is handled by Supabase; we
            never see or store your password in readable form.
          </li>
          <li>
            <strong>Profile and subscription data.</strong> Your subscription
            tier (free or Pro), a Stripe customer reference, and your email
            notification preference.
          </li>
          <li>
            <strong>Payment data.</strong>{" "}
            Payments are processed entirely by
            Stripe on Stripe&apos;s own pages. Card numbers never touch our
            servers. Stripe tells us who you are, whether your subscription is
            active, and nothing about your payment method beyond what is needed
            to manage the subscription.
          </li>
          <li>
            <strong>Email delivery data.</strong> If the 3:30 drop email is
            enabled for your account, our email provider (Resend) processes
            your address and standard delivery events.
          </li>
          <li>
            <strong>Server logs.</strong> Like nearly every website, our
            hosting infrastructure keeps short-lived request logs (IP address,
            browser user agent) used for debugging and abuse prevention.
          </li>
        </ul>
        <p>
          We use <strong>no analytics or advertising trackers</strong>, we do
          not build behavioral profiles, and we do not sell or share personal
          data for advertising. Ever.
        </p>
      </LegalSection>

      <LegalSection title="Market data and automated analysis">
        <p>
          The stock data on Zenith (prices, volume, SEC filings) is public
          market information from third-party market data sources and the
          SEC&apos;s EDGAR system. It contains no personal data, and our
          requests to those sources carry nothing about you.
        </p>
        <p>
          The daily short theses are computed by our own analysis engine from
          that public market data — SEC filings, historical base rates, and
          technical indicators. Every number in a thesis — the score, the base
          rate, the expected move — is calculated by that engine.
        </p>
        <p>
          A language model (Claude, from Anthropic) is used for one thing:
          putting those finished findings into readable sentences. It does not
          choose which stocks appear, does not produce or alter any figure, and
          cannot look anything up or browse the web. The sentences that carry
          the odds and the risk warnings are written by the engine and passed
          through untouched, and every figure the model does write is checked
          against the engine&apos;s own numbers before publication.{" "}
          <strong>
            No personal data about you is ever sent to an AI provider — it
            receives nothing but public market facts.
          </strong>
        </p>
      </LegalSection>

      <LegalSection title="How we use your data">
        <ul>
          <li>To sign you in and keep your account working.</li>
          <li>To know which features (free or Pro) to show you.</li>
          <li>To process your subscription through Stripe.</li>
          <li>
            To send the 3:30 drop email if it is enabled. It is on by default
            for new accounts; you can turn it off in Settings or with the
            one-click unsubscribe link in any email.
          </li>
          <li>To keep the service secure and diagnose problems.</li>
        </ul>
        <p>We do not use your data for anything else.</p>
      </LegalSection>

      <LegalSection title="Who we share data with">
        <p>
          Only the service providers that run Zenith, and only what each one
          needs: Supabase (database and authentication), Stripe (payments),
          Resend (email delivery), Anthropic (the language model that phrases
          the theses), and our hosting provider. Anthropic receives only the
          public market facts that make up a thesis — no personal data, and
          nothing that identifies you. None of them may use your data for their
          own purposes. We share data with no one else unless the law requires
          it.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          We keep account data for as long as your account exists. Email us to
          delete your account: your profile and authentication data are
          removed. Stripe retains transaction records it is legally required to
          keep.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask us for a copy of your data, ask us to correct it, or ask
          us to delete it, at{" "}
          <a className="text-brand" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . If you live somewhere with specific privacy laws (for example
          California or the EU), those rights apply to you and we honor them
          for everyone anyway. We respond to every request; there is no fee.
        </p>
      </LegalSection>

      <LegalSection title="Students and minors">
        <p>
          Zenith is built for high-school DECA competitors, and many users are
          under 18. If you are under 18, you should use Zenith with a parent or
          guardian&apos;s permission, and a Pro subscription should be
          purchased by or with a parent or guardian.
        </p>
        <p>
          Zenith is not directed to children under 13, and we do not knowingly
          collect personal data from anyone under 13. If you believe a child
          under 13 has created an account, email us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          All traffic is encrypted in transit (HTTPS). Passwords are hashed by
          Supabase Auth. Database access is restricted with row-level security,
          so Pro-only and per-user data is enforced at the database layer, not
          just in the app.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If this policy changes, we will update this page and the date at the
          top. Material changes to how we handle account data will be announced
          by email.
        </p>
        <p>
          See also the{" "}
          <Link className="text-brand" href="/terms">
            Terms &amp; Conditions
          </Link>{" "}
          and the{" "}
          <Link className="text-brand" href="/cookies">
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
