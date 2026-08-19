import type { NextConfig } from "next";
import { CANONICAL_HOST } from "./lib/site";

const nextConfig: NextConfig = {
  experimental: {
    // React <ViewTransition> on route navigations (see app/layout.tsx).
    viewTransition: true,
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
