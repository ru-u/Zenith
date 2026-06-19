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
    second: "2-digit",
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
    hour: Number(parts.hour) % 24, // some runtimes render midnight as "24"
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Seconds until the 4:00 PM ET close on a trading day, or null on
 * weekends/holidays or once past the close.
 */
export function secondsUntilCloseET(date: Date = new Date()): number | null {
  if (!isTradingDay(date)) return null;
  const { hour, minute, second } = etParts(date);
  const diff = 16 * 3600 - (hour * 3600 + minute * 60 + second);
  return diff > 0 ? diff : null;
}

/**
 * Seconds until the 9:30 AM ET open on a trading day, or null on
 * weekends/holidays or once the market has opened.
 */
export function secondsUntilOpenET(date: Date = new Date()): number | null {
  if (!isTradingDay(date)) return null;
  const { hour, minute, second } = etParts(date);
  const diff = (9 * 3600 + 30 * 60) - (hour * 3600 + minute * 60 + second);
  return diff > 0 ? diff : null;
}

/**
 * Minutes since the 4:00 PM ET close on a trading day, or null on
 * weekends/holidays or before the close. Used to wait out the closing auction
 * before freezing the official close.
 */
export function minutesSinceCloseET(date: Date = new Date()): number | null {
  if (!isTradingDay(date)) return null;
  const { hour, minute } = etParts(date);
  const mins = hour * 60 + minute;
  const close = 16 * 60; // 4:00 PM ET
  return mins >= close ? mins - close : null;
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

// US equity market holidays (NYSE/Nasdaq) as ET date keys. Maintain yearly.
const US_MARKET_HOLIDAYS = new Set<string>([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** A regular US trading day: a weekday that isn't a market holiday. */
export function isTradingDay(date: Date = new Date()): boolean {
  const { weekday } = etParts(date);
  if (weekday === 0 || weekday === 6) return false;
  return !US_MARKET_HOLIDAYS.has(getTodayET(date));
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
  | "closed"; // nights, weekends, and market holidays

/** Current US equities session, derived from ET wall-clock. */
export function getMarketSession(date: Date = new Date()): MarketSession {
  if (!isTradingDay(date)) return "closed";
  const { hour, minute } = etParts(date);
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
