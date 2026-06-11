// ET (America/New_York) market-calendar helpers. DST is handled by the Intl
// timezone database — no manual offset math, no external dependency.

const ET = "America/New_York";

/** Wall-clock parts in ET for a given instant. */
function etParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: weekdayMap[parts.weekday as string] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Today's date in ET as a YYYY-MM-DD key. */
export function getTodayET(date: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(date);
}

/** Format any Date as a YYYY-MM-DD key in ET. */
export function formatDateKey(date: Date): string {
  return getTodayET(date);
}

/** True when cached rows are older than the freshness threshold. */
export function isDataStale(
  scrapedAt: string | Date | null | undefined,
  thresholdMinutes = 10,
): boolean {
  if (!scrapedAt) return true;
  const ts = typeof scrapedAt === "string" ? Date.parse(scrapedAt) : scrapedAt.getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > thresholdMinutes * 60_000;
}

export type MarketSession =
  | "pre-market"
  | "open"
  | "after-hours"
  | "closed"; // nights + weekends (holidays not modeled in MVP)

/** Current US equities session, derived from ET wall-clock. */
export function getMarketSession(date: Date = new Date()): MarketSession {
  const { weekday, hour, minute } = etParts(date);
  if (weekday === 0 || weekday === 6) return "closed";
  const mins = hour * 60 + minute;
  const open = 9 * 60 + 30; // 9:30 AM ET
  const close = 16 * 60; // 4:00 PM ET
  if (mins < 4 * 60) return "closed"; // before 4:00 AM
  if (mins < open) return "pre-market";
  if (mins < close) return "open";
  if (mins < 20 * 60) return "after-hours"; // until 8:00 PM
  return "closed";
}

export type MarketStatus = "LIVE" | "DELAYED" | "CLOSED" | "HISTORICAL";

/**
 * Display status for the MarketStatusBadge, derived from stored row state
 * (no client-side timezone math required at the call site).
 */
export function getMarketStatus(opts: {
  isFinal?: boolean;
  scrapedAt?: string | null;
  isToday?: boolean;
}): MarketStatus {
  const { isFinal, isToday = true } = opts;
  if (!isToday) return "HISTORICAL";
  const session = getMarketSession();
  if (session === "open") return "DELAYED"; // provider data is 15-min delayed / near-real-time
  if (isFinal) return "CLOSED";
  return session === "closed" ? "CLOSED" : "DELAYED";
}
