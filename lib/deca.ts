// DECA Stock Market Game season dates, from the official DECA Guide 2026-27
// (high-school SMG, pp. 112-113). Maintain yearly alongside US_MARKET_HOLIDAYS
// in market-calendar.ts — once the deadline passes, diversificationCountdown()
// returns null, so a stale season hides the banner rather than showing a wrong
// date.

import { getTodayET, isTradingDay, secondsUntilCloseET } from "./market-calendar";

export const DECA_SMG_SEASON = {
  start: "2026-09-08",
  // $10k per asset class (long stock, mutual funds, bonds) by 4 PM ET, held
  // until `end`. End-of-Day game: an order entered after 4 PM fills at the NEXT
  // close, so 4 PM on this date is the real last moment.
  diversificationDeadline: "2026-10-23",
  end: "2026-12-04",
  rulesUrl:
    "https://cdn.prod.website-files.com/635c470cc81318fc3e9c1e0e/6a3c7be61d138e806b01186b_HS_SMG_Guidelines.pdf",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function keyToUTC(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export type DiversificationCountdown = {
  /** Calendar days from today (ET) to the deadline; 0 on the day itself. */
  calendarDays: number;
  /** Trading days left whose close still counts, today included until 4 PM. */
  tradingDays: number;
  isToday: boolean;
};

/** Days left to the diversification deadline, or null once it has passed. */
export function diversificationCountdown(
  now: Date = new Date(),
): DiversificationCountdown | null {
  const deadline = DECA_SMG_SEASON.diversificationDeadline;
  const today = getTodayET(now);
  if (today > deadline) return null;
  // secondsUntilCloseET is null past the close (deadline is a trading day).
  if (today === deadline && secondsUntilCloseET(now) == null) return null;

  const calendarDays = Math.round((keyToUTC(deadline) - keyToUTC(today)) / DAY_MS);

  // Today's close only counts while it's still ahead of us.
  let tradingDays = isTradingDay(now) && secondsUntilCloseET(now) != null ? 1 : 0;
  // Probe at UTC noon — the ET calendar date is stable there across DST.
  for (let i = 1; i <= calendarDays; i++) {
    if (isTradingDay(new Date(keyToUTC(today) + i * DAY_MS + DAY_MS / 2))) tradingDays++;
  }

  return { calendarDays, tradingDays, isToday: calendarDays === 0 };
}
