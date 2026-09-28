import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { qualifyingTickers } from "@/lib/tickerPages";
import { ARTICLES } from "@/lib/learn";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeAlert } from "@/lib/alerts";
import { getTodayET } from "@/lib/market-calendar";

// DYNAMIC ON PURPOSE, for the same reason app/stock/page.tsx is, and it must
// stay declared here explicitly.
//
// sitemap.ts is "a special Route Handler that is cached by default unless it
// uses a Request-time API or dynamic config option" (Next's own docs,
// 03-file-conventions/01-metadata/sitemap.md). This file used neither, so it was
// PRERENDERED AT BUILD TIME and then frozen until the next deploy: on
// 2026-09-20 the live sitemap carried a lastmod of 2026-09-19T16:50:52Z —
// twenty seconds after the commit that built it — and listed 109 tickers while
// /stock was rendering 164. Thirty-four percent of the qualifying pages were
// reachable only through that index page, and the gap regrew every day nobody
// deployed.
//
// It also made the fail-open below genuinely dangerous rather than merely
// cautious. At build time in an environment without SUPABASE_SERVICE_ROLE_KEY —
// which is exactly what .github/workflows/ci.yml supplies, and one Railway env
// slip away in production — createAdminClient() throws, the catch swallows it,
// and the deploy ships a twelve-URL sitemap with no error and no alert. Rendering
// per request means the ticker list is read with the service key that only
// exists at runtime, so that path is closed.
//
// The cost is bounded by QUALIFY_TTL_MS in lib/tickerPages.ts: the 6h memo
// absorbs the full-table scan, so this is one paged read every six hours per
// process, not one per request.
export const dynamic = "force-dynamic";

// Public, indexable routes only — mirrors the disallow list in app/robots.ts.
// The screener's content turns over every session, hence the daily frequency;
// the legal pages change only when lib/legal.ts LEGAL_UPDATED is bumped.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // The aggregate ticker pages. Memoized in lib/tickerPages, and fail-open: a
  // database blip must degrade the sitemap to the static routes, never 500 it,
  // because a broken sitemap.xml is worse than a short one.
  //
  // But fail-open here is invisible from the outside — the response is still a
  // 200 and still well-formed XML, just missing ~90% of its URLs — so it alerts.
  // maybeAlert dedups on (date, type) against the system_alerts unique
  // constraint, which is what makes this safe to put in a force-dynamic route:
  // a sustained outage emails once for the day, not once per crawler fetch.
  let tickers: string[] = [];
  try {
    tickers = await qualifyingTickers();
  } catch (e) {
    const detail = (e as Error)?.message ?? "unknown error";
    console.error("[sitemap] ticker list:", detail);
    // Best-effort: this is the one alert whose own dependency is the thing that
    // may have failed, so it gets its own guard rather than trusting maybeAlert's
    // internal one — createAdminClient() throws before maybeAlert is ever called
    // when SUPABASE_SERVICE_ROLE_KEY is the missing piece.
    try {
      await maybeAlert(createAdminClient(), {
        date: getTodayET(),
        type: "sitemap_degraded",
        subject: "Zenith: sitemap.xml served without ticker pages",
        body:
          `qualifyingTickers() threw, so sitemap.xml fell back to static routes ` +
          `only — a dozen URLs instead of the full list, which is an order of ` +
          `magnitude larger. Google will keep fetching it and seeing a healthy ` +
          `200.\n\n` +
          `Error: ${detail}\n\n` +
          `Most likely SUPABASE_SERVICE_ROLE_KEY is missing or rotated (it is ` +
          `read at request time by lib/supabase/admin.ts), or daily_gainers is ` +
          `unreachable. Check https://zenithscreener.com/sitemap.xml and count ` +
          `<url> entries; /stock renders the same list and will be short too.`,
      });
    } catch (alertErr) {
      console.error("[sitemap] alert failed:", (alertErr as Error)?.message);
    }
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
