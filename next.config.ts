import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // React <ViewTransition> on route navigations (see app/layout.tsx).
    viewTransition: true,
  },
};

export default nextConfig;
