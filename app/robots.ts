import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Everything behind auth or Pro is disallowed: not for secrecy (they're gated
// server-side anyway) but so crawlers don't burn budget on routes that render a
// login redirect, and so the sign-in wall never becomes the snippet Google shows
// for Zenith.
const DISALLOW = [
  "/api/",
  "/settings",
  "/history",
  "/analysis",
  "/auth/",
  "/forgot-password",
  "/reset-password",
];

// The crawlers behind ChatGPT, Claude, Perplexity, Gemini grounding, Apple
// Intelligence and Common Crawl. Named explicitly rather than left to the `*`
// rule for two reasons: it makes the decision to allow them legible to whoever
// audits this next, and it means a future tightening of `*` can't silently cut
// off answer-engine citations as a side effect.
//
// They get the same fence as everyone else — the public product and the
// methodology, none of the account surfaces. The trade is deliberate: these
// bots read the free board, and in exchange Zenith can be cited when someone
// asks an assistant about shorting in the DECA Stock Market Game. Most of them
// do NOT execute JavaScript, which is why lib/gainersSeed.ts exists.
//
// Google-Extended governs Gemini grounding/training ONLY. It has no effect on
// Google Search ranking in either direction — don't "fix" it by removing it.
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_AGENTS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
