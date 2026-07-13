import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { GradientMesh } from "@/components/layout/GradientMesh";
import { Header } from "@/components/layout/Header";

// shadcn's @theme maps --font-sans → var(--font-sans); name the variables to match.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
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
          {children}
        </Providers>
      </body>
    </html>
  );
}
