import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { qualifyingTickers } from "@/lib/tickerPages";
import { ARTICLES } from "@/lib/learn";

// Public, indexable routes only — mirrors the disallow list in app/robots.ts.
// The screener's content turns over every session, hence the daily frequency;
// the legal pages change only when lib/legal.ts LEGAL_UPDATED is bumped.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // The aggregate ticker pages. Memoized in lib/tickerPages, and fail-open: a
  // database blip must degrade the sitemap to the static routes, never 500 it,
  // because a broken sitemap.xml is worse than a short one.
  let tickers: string[] = [];
  try {
    tickers = await qualifyingTickers();
  } catch (e) {
    console.error("[sitemap] ticker list:", (e as Error)?.message);
  }

  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/screener`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/upgrade`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      // Findable, not promoted — same low priority as the policy pages.
      url: `${base}/engine`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/learn`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // Evergreen explainers — the part of the search surface that is actually
    // winnable for a niche this size.
    ...ARTICLES.map((a) => ({
      url: `${base}/learn/${a.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${base}/stock`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    // One per qualifying ticker. Weekly rather than daily: the aggregates only
    // move when the ticker hits the board again, which for most of these is a
    // few times a month.
    ...tickers.map((t) => ({
      url: `${base}/stock/${t}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
