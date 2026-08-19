import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { GradientMesh } from "@/components/layout/GradientMesh";
import { Header } from "@/components/layout/Header";
import { siteUrl } from "@/lib/site";

// shadcn's @theme maps --font-sans → var(--font-sans); name the variables to match.
// Next 16 + Turbopack does not emit a render-blocking `<link rel="preload"
// as="font">` for next/font on any route (verified against production), so on a
// cold first load the browser only discovers the Geist woff2 once layout needs
// it. With display:"swap" that produced a fallback→Geist reflow that read as a
// broken first paint (most visible on the big bg-clip-text hero headline) and
// "fixed itself" on reload once the font was cached. display:"optional" removes
// the swap: the size-adjusted fallback (adjustFontFallback, on by default) holds
// if Geist isn't ready within the block window, and Geist is used from cache on
// every subsequent view — no post-paint reflow either way.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "optional",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Zenith — Today's Top Short Candidates",
    template: "%s — Zenith",
  },
  description:
    "The day's biggest stock-market gainers, ranked. Spot the top movers and short the runners.",
  applicationName: "Zenith",
  openGraph: {
    title: "Zenith — Today's Top Short Candidates",
    description:
      "The day's biggest stock-market gainers, ranked. Spot the top movers and short the runners.",
    siteName: "Zenith",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zenith — Today's Top Short Candidates",
    description:
      "The day's biggest stock-market gainers, ranked. Spot the top movers and short the runners.",
  },
  other: {
    // Opt out of Dark Reader (and compatible auto-dark extensions) — Zenith is
    // dark-native with its own light mode. Dark Reader can't parse the oklch/
    // lab()+color-mix token pipeline: it rewrote --input into a red-toned
    // oklab (maroon search/filter fields) and stripped the landing headline's
    // background-image, leaving bg-clip-text letters fully transparent.
    // Reproduced 1:1 by injecting the darkreader npm engine; this meta is the
    // extension's documented site-level off switch, honored since DR 4.9.35.
    // (DR checks only the tag's presence; Next drops empty `other` values, so
    // it needs a non-empty content.)
    "darkreader-lock": "true",
  },
};

export const viewport: Viewport = {
  themeColor: "#090D11",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Smooth scrolling is set in globals.css for in-page anchors; this
      // attribute makes Next 16 suppress it during route transitions so
      // page-to-page navigation still scrolls to top instantly.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Brand gradient (cyan → polar-white) shared by SVG icons like the
            streak flame. CSS-var stops make it follow the active theme. */}
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <linearGradient id="streak-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--brand)" />
              <stop offset="1" stopColor="var(--foreground)" />
            </linearGradient>
          </defs>
        </svg>
        <Providers>
          <GradientMesh />
          <Header />
          {/* Route content cross-fades on navigation; the mesh and header sit
              outside the transition so the chrome stays rock-still. */}
          <ViewTransition>{children}</ViewTransition>
        </Providers>
      </body>
    </html>
  );
}
