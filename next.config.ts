import type { NextConfig } from "next";
import { CANONICAL_HOST } from "./lib/site";

const isDev = process.env.NODE_ENV === "development";

// The Supabase project origin has to be reachable from the browser (auth token
// refresh + PostgREST reads). Derived from the same env var the client uses so
// the two can't drift; falls back to allowing any Supabase host rather than
// silently breaking auth if the var is missing at build time.
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const { origin, host } = new URL(raw);
    return `${origin} wss://${host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
})();

// Content Security Policy.
//
// NONCES, AND WHY NOT: Next's documented strict setup generates a per-request
// nonce in proxy.ts, which forces EVERY page to render dynamically — the
// landing page and the legal pages lose static generation, and PPR is ruled
// out entirely. That is a real cost on a marketing-first site, and the payoff
// here is small: Zenith renders no user-generated HTML. There is no
// dangerouslySetInnerHTML in the codebase, the only user-supplied strings are
// feedback text (emailed as plain text, never rendered back) and tickers
// (regex-constrained to /^[A-Z][A-Z0-9.\-]{0,9}$/), and React escapes
// everything else by default. So `'unsafe-inline'` in script-src is an
// acknowledged tradeoff, not an oversight: it is there because Next inlines its
// own bootstrap and flight payload, and it means this CSP is defence in depth
// against injected *external* scripts, not a backstop for an inline XSS we
// don't have. If user-authored content ever gets rendered as HTML, this must
// become nonce-based first.
//
// style-src needs 'unsafe-inline' regardless — framer-motion writes inline
// styles on every animated element.
const csp = [
  `default-src 'self'`,
  // s3.tradingview.com serves tv.js, which builds the chart widget.
  // accounts.google.com/gsi/client is the Google Identity Services library that
  // renders the sign-in button (see components/auth/GoogleIdentityButton.tsx).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://s3.tradingview.com https://accounts.google.com/gsi/client`,
  `style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style`,
  `img-src 'self' blob: data: https://*.tradingview.com`,
  // next/font self-hosts Geist at build time, so no external font origin.
  `font-src 'self' data:`,
  // The GIS origins are the `gsi/` parent paths, not individual endpoints, so a
  // Google-side change of endpoint doesn't silently break sign-in.
  `connect-src 'self' ${supabaseOrigin} https://*.tradingview.com wss://*.tradingview.com https://accounts.google.com/gsi/${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  // We frame TradingView and the GIS button; nobody frames us.
  `frame-src https://*.tradingview.com https://accounts.google.com/gsi/`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  // /api/unsubscribe posts here, and Google Identity Services navigates to
  // accounts.google.com by form submission — Chrome enforces form-action across
  // the redirect chain, so omitting that origin blocks Google sign-in in Chrome
  // with nothing but a console line to show for it. Stripe Checkout is a
  // top-level navigation, not a form submission, so it needs nothing here.
  `form-action 'self' https://accounts.google.com`,
  // Production only. Chromium exempts "potentially trustworthy" origins from
  // the upgrade, so localhost is spared; WebKit does not, so Safari rewrites
  // every http://localhost:PORT dev request to https:// — which the dev server
  // doesn't serve, killing the document, its chunks, and the HMR socket.
  // Chrome stays fine, which makes this look like a Safari bug. It isn't.
  ...(isDev ? [] : [`upgrade-insecure-requests`]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Clickjacking: frame-ancestors above is the modern control; this is the
  // legacy companion for older browsers that ignore it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Sends only the origin cross-site — which is what keeps the unsubscribe
  // token in /api/unsubscribe?token=… out of third-party Referer headers.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Zenith uses none of these; deny them so an injected frame can't either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), interest-cohort=()",
  },
  // Two years + preload. Railway terminates TLS and the apex is HTTPS-only, so
  // there is no plaintext origin this can lock users out of. Dev-gated: RFC
  // 6797 says a UA must ignore HSTS received over plain HTTP, but there's no
  // reason to hand a two-year preload pin to a browser that isn't strict.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
  // Keeps this origin out of other sites' process, hardening against
  // cross-origin side-channel reads (Spectre-class).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Testing the dev server from a phone on the LAN. Next blocks cross-origin
  // requests for /_next dev resources by default, and the failure is silent
  // and misleading: HTML and CSS render fine, the client chunks never load, so
  // the page looks correct but nothing interactive works. Opt in per-host via
  // `DEV_ALLOWED_ORIGIN=192.168.x.x npm run dev` — unset (including every
  // production build) it stays off.
  ...(process.env.DEV_ALLOWED_ORIGIN
    ? { allowedDevOrigins: [process.env.DEV_ALLOWED_ORIGIN] }
    : {}),
  experimental: {
    // React <ViewTransition> on route navigations (see app/layout.tsx).
    viewTransition: true,
  },
  // Don't advertise the framework; it's free reconnaissance.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // API responses are per-user and must never be stored by a shared cache.
      // The routes set this themselves; belt-and-braces for any that forget.
      {
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
  // Canonicalize on the apex. Both hosts are registered as Railway custom
  // domains (so both get certs), and this collapses www onto the apex so
  // there's one canonical origin for SEO and for host-only session cookies.
  // Kept here rather than in Cloudflare so it survives a CDN/proxy change and
  // is visible in the repo. Per Next's documented execution order, config
  // `redirects` run BEFORE proxy.ts — so a www request is redirected without
  // paying for the Supabase session refresh first.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${CANONICAL_HOST}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
