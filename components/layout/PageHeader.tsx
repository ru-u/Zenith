import { cn } from "@/lib/utils";
import { AmbientChevrons } from "@/components/landing/AmbientChevrons";

/**
 * Shared app-page header: mono eyebrow + title + optional description, with
 * the landing's ascent motif echoed faintly behind it (theme-aware — these
 * pages keep light/dark support, unlike the dark-pinned landing). `children`
 * renders as a right-aligned slot for badges/chips.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  unique,
  motif = true,
  children,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Keeps the motif's SVG gradient ids collision-free per page. */
  unique: string;
  motif?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {motif && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-8 -top-12 h-52 opacity-50 dark:opacity-80"
        >
          <AmbientChevrons variant="echo" unique={unique} />
        </div>
      )}
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-brand">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
