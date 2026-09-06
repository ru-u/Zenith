// The schema.org nodes themselves, kept out of the component so every fact has
// one source: the site URL from lib/site.ts, the price from lib/pricing.ts, the
// contact address from lib/legal.ts. Nothing here should be a hand-typed
// duplicate of a value that already exists somewhere else in the repo.

import { siteUrl } from "@/lib/site";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { PRO_PRICE } from "@/lib/pricing";
import type { LearnArticle } from "@/lib/learn";

/** The canonical entity name. Deliberately NOT the bare word "Zenith". */
export const ENTITY_NAME = "Zenith Screener";

const ORG_ID = () => `${siteUrl()}/#organization`;
const SITE_ID = () => `${siteUrl()}/#website`;

export function organizationNode() {
  const base = siteUrl();
  return {
    "@type": "Organization",
    "@id": ORG_ID(),
    name: ENTITY_NAME,
    alternateName: "Zenith",
    url: base,
    logo: `${base}/icon.png`,
    email: LEGAL_CONTACT_EMAIL,
    description:
      "Zenith Screener ranks the day's biggest US stock-market gainers and publishes a quant-built short thesis on the top five before the close. Built for DECA Stock Market Game competitors.",
  };
}

export function webSiteNode() {
  const base = siteUrl();
  return {
    "@type": "WebSite",
    "@id": SITE_ID(),
    url: base,
    name: ENTITY_NAME,
    publisher: { "@id": ORG_ID() },
    inLanguage: "en-US",
  };
  // No potentialAction/SearchAction: there is no site-wide search to point it
  // at, and claiming one that doesn't exist is what gets markup ignored.
}

/** FAQPage built from the rendered Q&A — pass QA from components/landing/FAQ. */
export function faqPageNode(qa: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@type": "FAQPage",
    "@id": `${siteUrl()}/#faq`,
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/**
 * The product. `SoftwareApplication` rather than a finance type on purpose:
 * Zenith sells a research tool, it does not offer a financial product, and the
 * finance schema types imply the latter.
 */
export function proOfferNode() {
  const base = siteUrl();
  return {
    "@type": "SoftwareApplication",
    "@id": `${base}/#pro`,
    name: "Zenith Pro",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Stock screener",
    operatingSystem: "Web",
    url: `${base}/upgrade`,
    publisher: { "@id": ORG_ID() },
    description:
      "Zenith Pro adds a daily quant short thesis on the top five gainers, the 3:30 PM ET pre-close drop email, and unlimited history.",
    offers: {
      "@type": "Offer",
      // Stripe is the source of truth for what is actually charged; PRO_PRICE is
      // the display value and the two are kept in sync by hand (see lib/pricing).
      price: PRO_PRICE.replace(/^\$/, ""),
      priceCurrency: "USD",
      category: "subscription",
      url: `${base}/upgrade`,
    },
  };
}

/** BreadcrumbList for nested public pages (the /stock/* tree). */
export function breadcrumbNode(trail: ReadonlyArray<{ name: string; path: string }>) {
  const base = siteUrl();
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${base}${c.path === "/" ? "" : c.path}`,
    })),
  };
}

/**
 * An /learn explainer. `Article`, not `NewsArticle` or `FinancialProduct`:
 * these are evergreen education, not reporting and not an offer. Author is the
 * organization rather than a person — E-E-A-T wants an identifiable publisher,
 * and inventing a byline for one would be worse than naming the company.
 */
export function learnArticleNode(a: LearnArticle) {
  const base = siteUrl();
  return {
    "@type": "Article",
    "@id": `${base}/learn/${a.slug}#article`,
    headline: a.title,
    description: a.description,
    url: `${base}/learn/${a.slug}`,
    author: { "@id": ORG_ID() },
    publisher: { "@id": ORG_ID() },
    isAccessibleForFree: true,
    inLanguage: "en-US",
  };
}
