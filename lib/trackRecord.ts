// The engine's paper-trade record: short every thesis scored at or above a
// threshold, hold one session. It started as scripts/backtest.mjs's rule made
// permanent, and now differs from it in two ways (the position cap and the
// untradeable exclusion below), so the two will not agree to the dollar. It
// doesn't have to be re-run by hand — it reads `ai_analyses` live, and
// recordThesisOutcomes fills in the newest session at the ~4:20 ET run-eod, so
// the page is current after every close with no job of its own.
//
// Fills mirror DECA's End-of-Day game 1:1: short at the scored day's close
// (`scored_day_close`), cover at the next session's close (`next_close`), the
// account split evenly across that day's qualifying calls and compounded, with
// no single position larger than `maxPosition` of the account — the rest sits
// in cash. No qualifying call → all cash for that session. No borrow fees or
// commissions, which DECA doesn't charge either.
//
// The cap is ours, not DECA's (the guide sets none we could find). Without it a
// day with one qualifying call put the whole account into one short: AIOK
// 2026-10-27 lost 109.7% and took the account to -$14,986, after which the
// compounding ran on a negative balance and every sign on the page inverted.
// The $0 floor is the second guard — a loss past the account ends the record
// (`bustedOn`) instead of producing a negative balance.
//
// `untradeable` drops calls a competitor could never have placed. Today that is
// theses whose board row had no market cap (AIOK's four), which DECA's $25M
// floor can't be checked against; the page decides the set, this file only
// applies it.
//
// Pure — no I/O — so the numbers can be checked against a script.

export type TrackRow = {
  date: string;
  ticker: string;
  rank: number | null;
  short_score: number | null;
  next_date: string | null;
  scored_day_close: number | null;
  next_close: number | null;
  next_change_percent: number | null;
};

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
};

export type TrackPoint = {
  /** Session the positions were opened (the thesis date). */
  scoredDate: string;
  /** Session they were covered — the close this account value is marked at. */
  coverDate: string;
  equity: number;
  /** That session's portfolio return, %. 0 when in cash. */
  ret: number;
  trades: TrackTrade[];
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
  };
  /** Qualifying calls on the newest session(s), settling at the next close. */
  open: { date: string; ticker: string; score: number; rank: number | null }[];
  /** Qualifying calls on settled sessions whose outcome never recorded
   *  (halted, delisted). Excluded from the curve, listed so it's visible. */
  unresolved: { date: string; ticker: string; score: number }[];
  /** Qualifying calls left out because they weren't tradeable in the game. */
  excluded: { date: string; ticker: string; score: number }[];
};

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
    /** tradeKey()s of calls a competitor couldn't have placed. */
    untradeable?: ReadonlySet<string>;
  },
): TrackRecord {
  const { minScore, startDate, startingCash, maxPosition } = opts;
  const untradeable = opts.untradeable ?? new Set<string>();
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
  const qualifying = scored.filter((r) => !untradeable.has(tradeKey(r.date, r.ticker)));

  const run = (skip?: { date: string; ticker: string }) => {
    let equity = startingCash;
    let peak = equity;
    let maxDD = 0;
    let bustedOn: string | null = null;
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
        }))
        .sort((a, b) => b.score - a.score || (a.rank ?? 99) - (b.rank ?? 99));
      const ret = trades.reduce((a, t) => a + t.pnl * t.weight, 0);
      equity = Math.max(0, equity * (1 + ret / 100));
      if (equity === 0) bustedOn = settled.get(date)!;
      peak = Math.max(peak, equity);
      maxDD = Math.min(maxDD, equity / peak - 1);
      points.push({ scoredDate: date, coverDate: settled.get(date)!, equity, ret, trades });
    }
    return { points, equity, maxDD, bustedOn };
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
    trades: [],
  };

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
    },
    open: qualifying
      .filter((r) => r.date > lastSettled && r.next_change_percent == null)
      .map((r) => ({ date: r.date, ticker: r.ticker, score: r.short_score!, rank: r.rank }))
      .sort((a, b) => b.score - a.score || (a.rank ?? 99) - (b.rank ?? 99)),
    unresolved: qualifying
      .filter((r) => r.date <= lastSettled && r.next_change_percent == null)
      .map((r) => ({ date: r.date, ticker: r.ticker, score: r.short_score! })),
    excluded: scored
      .filter((r) => untradeable.has(tradeKey(r.date, r.ticker)))
      .map((r) => ({ date: r.date, ticker: r.ticker, score: r.short_score! }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
