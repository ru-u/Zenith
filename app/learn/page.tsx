import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { Disclaimer } from "@/components/legal/Disclaimer";
import { ARTICLES } from "@/lib/learn";

export const metadata: Metadata = {
  title: "Learn",
  description:
    "Plain-English explainers for the DECA Stock Market Game: how shorting works, how end-of-day orders fill, why stocks fade after a spike, and the vocabulary of a top-gainers screener.",
  alternates: { canonical: "/learn" },
};

export default function LearnIndexPage() {
  return (
    <LegalShell
      eyebrow="Learn"
      title="Learn"
      description="Short explainers for competitors who are new to markets. No jargon assumed, and no promises about outcomes."
      unique="learn-index"
    >
      <LegalSection title="Articles">
        <ul className="flex flex-col gap-4 [&_li]:ml-0 [&_li]:list-none">
          {ARTICLES.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/learn/${a.slug}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {a.title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">{a.standfirst}</p>
            </li>
          ))}
        </ul>
        <Disclaimer className="px-0 pt-2" />
      </LegalSection>
    </LegalShell>
  );
}
