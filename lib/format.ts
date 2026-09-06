// Number formatting for the gainers UI. Compact, locale-aware, null-safe.

export function formatPercent(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// "YYYY-MM-DD" → "Jun 23, 2025". Parsed as UTC so the calendar date never
// shifts across the viewer's timezone.
export function formatDayLabel(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "YYYY-MM-DD" → "Fri, Sep 4". The weekday earns its place in prose: the only
// caller is the warm-up subhead, where the reader's question is "how old is
// this?" and a weekday answers it faster than a date. No year — the gap is
// never more than a few days. Parsed as UTC, same as formatDayLabel.
export function formatSessionDay(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return COMPACT.format(n);
}

export function formatMarketCap(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${COMPACT.format(n)}`;
}

export function formatRelVolume(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}
