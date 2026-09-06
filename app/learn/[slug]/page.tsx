import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { Disclaimer } from "@/components/legal/Disclaimer";
import { Prose } from "@/components/learn/Prose";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbNode, learnArticleNode } from "@/lib/schema";
import { ARTICLES, articleBySlug, LEARN_UPDATED } from "@/lib/learn";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = articleBySlug(slug);
  if (!a) return {};
  return {
    title: a.metaTitle,
    description: a.description,
    alternates: { canonical: `/learn/${a.slug}` },
  };
}

export default async function LearnArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();

  return (
    <>
      <JsonLd
        data={[
          learnArticleNode(article),
          breadcrumbNode([
            { name: "Learn", path: "/learn" },
            { name: article.title, path: `/learn/${article.slug}` },
          ]),
        ]}
      />
      <LegalShell
        eyebrow={article.eyebrow}
        title={article.title}
        description={article.standfirst}
        unique={`learn-${article.slug}`}
        updated={LEARN_UPDATED}
      >
        {article.sections.map((s) => (
          <LegalSection key={s.title} title={s.title}>
            {s.body.map((para, i) => (
              <Prose key={i} text={para} />
            ))}
          </LegalSection>
        ))}

        <LegalSection title="Related">
          <ul>
            {ARTICLES.filter((a) => a.slug !== article.slug).map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/learn/${a.slug}`}
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
          <Disclaimer className="px-0 pt-2" />
        </LegalSection>
      </LegalShell>
    </>
  );
}
