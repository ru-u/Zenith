import { PageHeader } from "@/components/layout/PageHeader";
import { LEGAL_UPDATED } from "@/lib/legal";

/**
 * Shared shell for the legal pages (/privacy, /terms, /cookies): PageHeader
 * with the ascent echo, a "last updated" stamp, and prose sections. Server
 * components only; theme-aware like other app pages.
 */
export function LegalShell({
  eyebrow,
  title,
  description,
  unique,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  unique: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        unique={unique}
      />
      <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Last updated: {LEGAL_UPDATED}
      </p>
      <div className="mt-10 flex flex-col gap-9">{children}</div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2.5 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
