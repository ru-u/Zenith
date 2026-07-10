import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Zenith uses only the cookies required to sign you in. No analytics, no ads, no third-party trackers.",
};

export default function CookiesPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Cookie Policy"
      description="The short version: the only cookies Zenith sets are the ones that keep you signed in. No analytics, no advertising, no trackers."
      unique="cookies"
    >
      <LegalSection title="The cookies we set">
        <p>
          When you sign in, Supabase (our authentication provider) sets session
          cookies on Zenith&apos;s domain (named like{" "}
          <code className="font-mono text-xs">sb-…-auth-token</code>). They
          exist so you stay signed in as you browse, and they are refreshed
          automatically while you use the site. Signing out removes them. If
          you never create an account, Zenith sets no cookies at all.
        </p>
        <p>
          These are &quot;strictly necessary&quot; cookies: the site&apos;s
          signed-in features cannot work without them, they identify you only
          to us, and they are not used to track you across other sites.
        </p>
      </LegalSection>

      <LegalSection title="What we deliberately don't use">
        <ul>
          <li>No analytics cookies or scripts.</li>
          <li>No advertising or cross-site tracking cookies.</li>
          <li>No third-party cookies on our pages.</li>
          <li>No fingerprinting.</li>
        </ul>
        <p>
          This is also why Zenith has no cookie consent banner: consent
          requirements apply to non-essential cookies, and we use none. If we
          ever add something that needs consent, we will update this policy and
          ask first.
        </p>
      </LegalSection>

      <LegalSection title="Local storage">
        <p>
          Your theme choice (light or dark) is kept in your browser&apos;s
          local storage. It never leaves your device and contains nothing
          personal.
        </p>
      </LegalSection>

      <LegalSection title="Stripe checkout">
        <p>
          Paying for Pro happens on Stripe&apos;s own checkout pages at
          stripe.com, where Stripe sets its own cookies for payment processing
          and fraud prevention under{" "}
          <a
            className="text-brand"
            href="https://stripe.com/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Stripe&apos;s privacy policy
          </a>
          . Zenith&apos;s own pages do not load Stripe scripts or cookies.
        </p>
      </LegalSection>

      <LegalSection title="Managing cookies">
        <p>
          You can clear or block cookies in your browser settings. Blocking the
          Supabase session cookies will prevent signing in; everything public
          on Zenith still works. Questions:{" "}
          <a className="text-brand" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . See also the{" "}
          <Link className="text-brand" href="/privacy">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link className="text-brand" href="/terms">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
