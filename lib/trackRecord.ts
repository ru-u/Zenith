// The engine's paper-trade record: short every thesis scored at or above a
// threshold, hold one session. It started as scripts/backtest.mjs's rule made
// permanent, and now plays by DECA's SMG trading rules (below), so the two will
// not agree to the dollar. It doesn't have to be re-run by hand — it reads
// `ai_analyses` live, and recordThesisOutcomes fills in the newest session at
// the ~4:20 ET run-eod, so the page is current after every close with no job of
// its own.
//
// Fills mirror DECA's End-of-Day game 1:1: short at the scored day's close
// (`scored_day_close`), cover at the next session's close (`next_close`), the
// account split evenly across that day's qualifying calls and compounded. The
// rules applied, from the DECA Guide 2026-27 (HS SMG, p. 113) and SMG's Rules of
// the Game:
//   - Maximum Equity: no more than "20% of their Total Equity multiplied by
//     1.5" (30%) in any one security, checked when the order is placed. Before
//     2026-11 this record used 50% under the belief DECA set no cap, and AIOK
//     2026-10-27 (-109.7%, one call that session) is why there's a cap at all.
//     The guide words it for longs ("purchase additional shares"); we apply it
//     to shorts too, which is the conservative reading.
//   - $3 floor: SMG won't open a short on a stock below $3 "the day before and
//     the day of execution" — checked on both closes from the thesis row.
//   - $25M market-cap floor: the page decides that set (`untradeable`) from the
//     board row, since ai_analyses stores no cap.
//   - $5 per transaction: a short and its cover are two, so $10 per position,
//     taken from the account at the cover.
//   - Diversification: at least $10k each in long stock, mutual funds and bonds
//     by the deadline, held to the end; shorts don't count. Modeled as the
//     plainest fill (`longs`): whole shares, rounded UP so each leg clears $10k,
//     bought at the deadline's close and never traded. They're bought from cash
//     and are part of Total Equity, so they move the account and every later
//     short's size, which is still a fraction of Total Equity.
// Not modeled, because each is too small to move the curve: the SEC fee on
// sells, fund distributions, and 0.75%/yr credited on cash. 7% on negative cash
// never applies — short proceeds are credited to cash, so cash stays above the
// ~$31k the longs cost, and total short exposure tops out at 100% of the
// account (4+ calls × 25%), inside DECA's 50% margin allowance.
//
// The $0 floor is ours: a loss past the account ends the record (`bustedOn`)
// instead of compounding on a negative balance and inverting every sign.
//
// Pure — no I/O — so the numbers can be checked against a script.

export type TrackRow = {
  date: string;
  ticker: string;
  rank: number | null;
  short_score: number | null;
  next_date: string | null;
  scored_day_close: number | null;
  /** The scored day's close-to-close move — backs out the day-before close. */
  scored_day_change_percent: number | null;
  next_close: number | null;
  next_change_percent: number | null;
};

/** Why a qualifying call was left out of the record. */
export type ExcludedReason = "price" | "cap";

export type TrackTrade = {
  ticker: string;
  score: number;
  rank: number | null;
  shortAt: number | null;
  coverAt: number | null;
  /** Short P&L, %. The stock falling is the short's gain. */
  pnl: number;
  /** Fraction of the account this short was sized at. */
  weight: number;
  /** Dollars shorted: `weight` of the account at the previous close. */
  notional: number;
};

export type TrackPoint = {
  /** Session the positions were opened (the thesis date). */
  scoredDate: string;
  /** Session they were covered — the close this account value is marked at. */
  coverDate: string;
  equity: number;
  /** That session's portfolio return, %, net of commissions. 0 when in cash. */
  ret: number;
  /** Commissions paid that session, $. */
  fees: number;
  trades: TrackTrade[];
  /** Market value of the diversification longs at this close. 0 before. */
  longValue: number;
  /** Their $ move this session, before the buy commissions (in `fees`). */
  longPnl: number;
};

export type LongLeg = {
  symbol: string;
  name: string;
  assetClass: string;
  /** ET date → close. Null when the history couldn't be fetched. */
  closes: ReadonlyMap<string, number> | null;
};

export type LongPosition = {
  symbol: string;
  name: string;
  assetClass: string;
  shares: number;
  buyAt: number;
  cost: number;
  /** Close at the record's last mark, carried forward over a missing day. */
  lastAt: number;
  value: number;
  pnl: number;
  pnlPct: number;
};

export type TrackRecord = {
  minScore: number;
  startDate: string;
  startingCash: number;
  /** Chronological. The first point is the starting cash, before any fill. */
  points: TrackPoint[];
  stats: {
    equity: number;
    returnPct: number;
    trades: number;
    wins: number;
    sessions: number;
    sessionsInMarket: number;
    maxDrawdownPct: number;
    best: (TrackTrade & { date: string }) | null;
    worst: (TrackTrade & { date: string }) | null;
    /** Final account had the single best trade never been called (that day's
     *  other calls take its capital) — how much one outlier is carrying. */
    equityWithoutBest: number | null;
    /** Cover date of the session that took the account to $0, if one did. */
    bustedOn: string | null;
    /** Total commissions paid, $. */
    commissions: number;
    /** Largest single position as a fraction of the account. */
    largestWeight: number;
    /** Fewest whole shares any short could have been — vs SMG's 10 minimum. */
    fewestShares: number | null;
  };
  /** Qualifying calls on the newest session(s), settling at the next close. */
  open: { date: string; ticker: string; score: number; rank: number | null }[];
  /** Qualifying calls on settled sessions whose outcome never recorded
   *  (halted, delisted). Excluded from the curve, listed so it's visible. */
  unresolved: { date: string; ticker: string; score: number }[];
  /** Qualifying calls left out because they weren't tradeable in the game. */
  excluded: { date: string; ticker: string; score: number; reason: ExcludedReason }[];
  /** The diversification sleeve, or null when none was configured. */
  longs: {
    buyDate: string;
    /** Bought yet — false while the record ends before `buyDate`. */
    bought: boolean;
    positions: LongPosition[];
    cost: number;
    value: number;
    pnl: number;
    /** Legs left out — no history, or no close on `buyDate`. */
    missing: string[];
  } | null;
};

/** Close on `date`, else the latest before it (a fund NAV not posted yet, a
 *  feed gap). Null only when nothing precedes it. */
function closeOn(closes: ReadonlyMap<string, number>, date: string): number | null {
  const exact = closes.get(date);
  if (exact != null) return exact;
  let best: string | null = null;
  for (const d of closes.keys()) if (d < date && (best == null || d > best)) best = d;
  return best == null ? null : closes.get(best)!;
}

/** True when SMG would refuse to open this short on the $3 floor. Null figures
 *  skip the check — exclusion needs positive evidence, as in isGameEligible. */
function underPriceFloor(r: TrackRow, minPrice: number): boolean {
  const close = r.scored_day_close;
  if (close == null) return false;
  // Same tolerance as normalize.ts: the day-before close is a division.
  const floor = minPrice * (1 - 1e-6);
  if (close < floor) return true;
  if (r.scored_day_change_percent == null) return false;
  return close / (1 + r.scored_day_change_percent / 100) < floor;
}

/** `untradeable` key for a thesis row. */
export const tradeKey = (date: string, ticker: string) => `${date}|${ticker}`;

export function buildTrackRecord(
  rows: TrackRow[],
  opts: {
    minScore: number;
    startDate: string;
    startingCash: number;
    /** Largest fraction of the account any one short may take, (0, 1]. */
    maxPosition: number;
    /** Dollars per transaction; each position pays it twice (short + cover). */
    commission: number;
    /** No short opens if either the scored day's or the prior close is below. */
    minPrice: number;
    /** tradeKey()s of calls under the market-cap floor (or with no cap). */
    untradeable?: ReadonlySet<string>;
    /** Diversification longs: `minPerLeg` of each, bought at `buyDate`'s
     *  close in whole shares, held to the end. */
    longs?: { buyDate: string; minPerLeg: number; legs: LongLeg[] };
  },
): TrackRecord {
  const { minScore, startDate, startingCash, maxPosition, commission, minPrice } = opts;
  const untradeable = opts.untradeable ?? new Set<string>();

  // Sized once off the buy-day close; rounded up, since rounding down would
  // leave the leg under the minimum.
  const buyDate = opts.longs?.buyDate ?? "";
  const legs = (opts.longs?.legs ?? []).flatMap((l) => {
    const buyAt = l.closes?.get(buyDate);
    if (!l.closes || buyAt == null) return [];
    return [{ ...l, closes: l.closes, buyAt, shares: Math.ceil(opts.longs!.minPerLeg / buyAt) }];
  });
  const missing = (opts.longs?.legs ?? []).filter((l) => !legs.some((x) => x.symbol === l.symbol)).map((l) => l.symbol);
  // At the close of `date`; a leg with no close yet sits at its buy price.
  const longsAt = (date: string) =>
    date < buyDate ? 0 : legs.reduce((a, l) => a + l.shares * (closeOn(l.closes, date) ?? l.buyAt), 0);
  const inWindow = rows.filter((r) => r.date >= startDate && r.short_score != null);

  // A session is settled once ANY of its theses has an outcome — they all cover
  // at the same next close. Sessions with theses but no qualifying call still
  // count, as cash, so the x-axis doesn't silently skip days.
  const settled = new Map<string, string>(); // scored date → cover date
  for (const r of inWindow) {
    if (r.next_change_percent != null && r.next_date) settled.set(r.date, r.next_date);
  }
  const sessions = [...settled.keys()].sort();
  const lastSettled = sessions.at(-1) ?? "";

  const scored = inWindow.filter((r) => (r.short_score ?? 0) >= minScore);
  // Price first: it's checked off the thesis row itself, so it's the more
  // certain of the two when both apply.
  const exclusion = (r: TrackRow): ExcludedReason | null =>
    underPriceFloor(r, minPrice) ? "price" : untradeable.has(tradeKey(r.date, r.ticker)) ? "cap" : null;
  const qualifying = scored.filter((r) => exclusion(r) == null);

  const run = (skip?: { date: string; ticker: string }) => {
    let equity = startingCash;
    let peak = equity;
    let maxDD = 0;
    let bustedOn: string | null = null;
    let commissions = 0;
    const points: TrackPoint[] = [];
    for (const date of sessions) {
      if (bustedOn) break;
      const picks = qualifying
        .filter((r) => r.date === date && r.next_change_percent != null)
        .filter((r) => !(skip && r.date === skip.date && r.ticker === skip.ticker));
      const weight = picks.length ? Math.min(1 / picks.length, maxPosition) : 0;
      const trades: TrackTrade[] = picks
        .map((r) => ({
          ticker: r.ticker,
          score: r.short_score!,
          rank: r.rank,
          shortAt: r.scored_day_close,
          coverAt: r.next_close,
          pnl: -r.next_change_percent!,
          weight,
          notional: weight * equity,
        }))
        .sort((a, b) => b.score - a.score || (a.rank ?? 99) - (b.rank ?? 99));
      const cover = settled.get(date)!;
      const before = equity;
      const gross = trades.reduce((a, t) => a + t.pnl * t.weight, 0);
      // The session whose close the longs were bought at pays their commission
      // and marks them at cost; every later one carries their close-to-close.
      const buying = legs.length > 0 && date < buyDate && cover >= buyDate;
      const longPnl = cover >= buyDate ? longsAt(cover) - (buying ? longsAt(buyDate) : longsAt(date)) : 0;
      const fees = trades.length * 2 * commission + (buying ? legs.length * commission : 0);
      commissions += fees;
      equity = Math.max(0, equity * (1 + gross / 100) + longPnl - fees);
      const ret = before > 0 ? (equity / before - 1) * 100 : 0;
      if (equity === 0) bustedOn = cover;
      peak = Math.max(peak, equity);
      maxDD = Math.min(maxDD, equity / peak - 1);
      points.push({ scoredDate: date, coverDate: cover, equity, ret, fees, trades, longValue: longsAt(cover), longPnl });
    }
    return { points, equity, maxDD, bustedOn, commissions };
  };

  const main = run();
  const all = main.points.flatMap((p) => p.trades.map((t) => ({ ...t, date: p.scoredDate })));
  const best = all.length ? all.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
  const worst = all.length ? all.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;

  const start: TrackPoint = {
    scoredDate: startDate,
    coverDate: startDate,
    equity: startingCash,
    ret: 0,
    fees: 0,
    trades: [],
    longValue: 0,
    longPnl: 0,
  };
  const markedThrough = main.points.at(-1)?.coverDate ?? startDate;
  const bought = legs.length > 0 && markedThrough >= buyDate;
  const positions: LongPosition[] = legs.map((l) => {
    const lastAt = bought ? (closeOn(l.closes, markedThrough) ?? l.buyAt) : l.buyAt;
    const cost = l.shares * l.buyAt;
    const value = l.shares * lastAt;
    return {
      symbol: l.symbol,
      name: l.name,
      assetClass: l.assetClass,
      shares: l.shares,
      buyAt: l.buyAt,
      cost,
      lastAt,
      value,
      pnl: value - cost,
      pnlPct: (lastAt / l.buyAt - 1) * 100,
    };
  });
  const shares = all
    .filter((t) => t.shortAt != null && t.shortAt > 0)
    .map((t) => Math.floor(t.notional / t.shortAt!));

  return {
    minScore,
    startDate,
    startingCash,
    points: [start, ...main.points],
    stats: {
      equity: main.equity,
      returnPct: (main.equity / startingCash - 1) * 100,
      trades: all.length,
      wins: all.filter((t) => t.pnl > 0).length,
      sessions: sessions.length,
      sessionsInMarket: main.points.filter((p) => p.trades.length > 0).length,
      maxDrawdownPct: main.maxDD * 100,
      best,
      worst,
      equityWithoutBest: best ? run(best).equity : null,
      bustedOn: main.bustedOn,
      commissions: main.commissions,
      largestWeight: all.reduce((m, t) => Math.max(m, t.weight), 0),
      fewestShares: shares.length ? Math.min(...shares) : null,
    },
    open: qualifying
      .filter((r) => r.date > lastSettled && r.next_change_percent == null)
      .map((r) => ({ date: r.date, ticker: r.ticker, score: r.short_score!, rank: r.rank }))
      .sort((a, b) => b.score - a.score || (a.rank ?? 99) - (b.rank ?? 99)),
    unresolved: qualifying
      .filter((r) => r.date <= lastSettled && r.next_change_percent == null)
      .map((r) => ({ date: r.date, ticker: r.ticker, score: r.short_score! })),
    excluded: scored
      .filter((r) => exclusion(r) != null)
      .map((r) => ({ date: r.date, ticker: r.ticker, score: r.short_score!, reason: exclusion(r)! }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    longs: opts.longs
      ? {
          buyDate,
          bought,
          positions,
          cost: positions.reduce((a, p) => a + p.cost, 0),
          value: positions.reduce((a, p) => a + p.value, 0),
          pnl: positions.reduce((a, p) => a + p.pnl, 0),
          missing,
        }
      : null,
  };
}
