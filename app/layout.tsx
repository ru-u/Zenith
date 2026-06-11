import type { Metadata } from "next";
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
  title: "Zenith — Today's Top Short Candidates",
  description:
    "The day's biggest stock-market gainers, ranked. Spot the top movers and short the runners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <GradientMesh />
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
