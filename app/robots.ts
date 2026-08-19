import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Only meaningful now that there's a real domain — the Railway host was never
// worth indexing. Everything behind auth or Pro is disallowed: not for secrecy
// (they're gated server-side anyway) but so crawlers don't burn budget on
// routes that render a login redirect, and so the sign-in wall never becomes
// the snippet Google shows for Zenith.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/settings",
        "/history",
        "/analysis",
        "/auth/",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
