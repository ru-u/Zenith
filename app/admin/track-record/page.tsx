import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DECA_SMG_SEASON } from "@/lib/deca";
import { buildTrackRecord, tradeKey, type ExcludedReason, type TrackRow } from "@/lib/trackRecord";
import { fetchDailyCloses, fetchTreasuryNoteCloses } from "@/lib/dailyCloses";
import { isGameEligible, MIN_MARKET_CAP, MIN_PRICE } from "@/lib/marketdata/normalize";
import { PageHeader } from "@/components/layout/PageHeader";
import { EquityCurve } from "@/components/admin/EquityCurve";
import { fmtDay, fmtPct, fmtUsd } from "@/components/admin/format";
import { formatPrice } from "@/lib/format";

// Owner-only, live paper-trade record for the competition. Reads ai_analyses on
// every request, and run-eod records the newest outcomes ~4:20 ET, so it is
// current after each close with nothing to re-run. See lib/trackRecord.ts.
//
// NOT a public track record, and must not become one without a compliance pass:
// it names tickers with per-session P&L (the Pro archive) and is a performance
// claim about short calls on real securities.
export const dynamic = "force-dynamic";

// Gated like the page: a static `metadata` export ships "Track record" in the
// RSC payload of the 404 too, which tells a prober the route exists. getViewer
// is request-memoized, so this costs no second auth round trip.
export async function generateMetadata(): Promise<Metadata> {
  const { user } = await getViewer();
  if (!isAdmin(user)) return { robots: { index: false, follow: false } };
  return { title: "Track record", robots: { index: false, follow: false } };
}

const MIN_SCORE = 7;
// DECA SMG's trading rules (DECA Guide 2026-27, HS SMG p. 113, plus SMG's Rules
// of the Game) — see lib/trackRecord.ts for how each is applied.
const STARTING_CASH = 100_000;
// "20% of their Total Equity multiplied by 1.5 in any one security". Binds on
// any session with 1-3 qualifying calls; 4+ split evenly under it.
const MAX_POSITION = 0.2 * 1.5;
const COMMISSION = 5;
// DECA's diversification rule, filled the plainest way a team could: one flat
// stock, an S&P 500 index fund and a new 10-year Treasury note, bought at the
// deadline's close. ETFs don't count as their underlying class in SMG, so the
// stock is a single name and the bond a real bond.
//
// The stock was picked IN HINDSIGHT, on 2026-11-11, so it is chosen to move the
// record as little as possible rather than to flatter it: of a dozen low-vol
// blue chips (KO, PG, JNJ, PEP, DUK, SO, BRK-B, WMT, MCD, CL, MRK, VZ), SO had
// the smallest move from the Oct 23 close (+0.8% to Nov 10, never past 1.9%)
// and the lowest daily volatility. Don't re-pick it off later prices — that
// turns a neutral choice into a tuned one. Marks and the note's pricing model
// are in lib/dailyCloses.ts.
const MIN_PER_CLASS = 10_000;
const MARKET_LONGS = [
  { symbol: "SO", name: "Southern Company", assetClass: "Long stock" },
  { symbol: "VFIAX", name: "Vanguard 500 Index Admiral", assetClass: "Mutual fund" },
] as const;
const BOND = "UST 10Y";
const pct = (f: number) => `${Math.round(f * 100)}%`;
const signedUsd = (n: number) => `${n < 0 ? "−" : "+"}${fmtUsd(Math.abs(n))}`;

const pnlClass = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "");

// tradeKey()s of 7+ calls under DECA's $25M floor, read off the previous-close
// cap backed out of the board row (isGameEligible with the price half skipped —
// the $3 rule is applied from the thesis row in lib/trackRecord.ts). A null cap
// is a fail too: the floor can't be met on no data (AIOK's four, Oct 2026). A
// thesis ticker with no board row that day — it left the board after the drop —
// has nothing to check against and stays in. Paged: daily_gainers is ~100 rows a
// session, past PostgREST's 1,000-row default within a season.
async function underCapFloor(
  admin: ReturnType<typeof createAdminClient>,
  rows: TrackRow[],
): Promise<Set<string>> {
  const calls = new Set(
    rows.filter((r) => (r.short_score ?? 0) >= MIN_SCORE).map((r) => tradeKey(r.date, r.ticker)),
  );
  const tickers = [...new Set(rows.filter((r) => (r.short_score ?? 0) >= MIN_SCORE).map((r) => r.ticker))];
  const out = new Set<string>();
  if (!tickers.length) return out;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("daily_gainers")
      .select("date, ticker, change_percent, market_cap")
      .in("ticker", tickers)
      .gte("date", DECA_SMG_SEASON.start)
      .lt("date", DECA_SMG_SEASON.end)
      .order("date")
      .order("ticker")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`track record read failed: ${error.message}`);
    for (const r of data) {
      const key = tradeKey(r.date, r.ticker);
      if (!calls.has(key)) continue;
      if (r.market_cap == null || !isGameEligible(null, r.change_percent, r.market_cap)) out.add(key);
    }
    if (data.length < PAGE) return out;
  }
}

// Awaits at the top on purpose, unlike /analysis: the gate must run BEFORE any
// byte streams. notFound() thrown inside a Suspense boundary after the shell has
// flushed still returns 200 with this page's header, which confirms the route.
export default async function TrackRecordPage() {
  const { user } = await getViewer();
  if (!isAdmin(user)) notFound();

  const admin = createAdminClient();
  const buyDate = DECA_SMG_SEASON.diversificationDeadline;
  const [theses, note, ...histories] = await Promise.all([
    admin
      .from("ai_analyses")
      .select(
        "date, ticker, rank, short_score, next_date, scored_day_close, scored_day_change_percent, next_close, next_change_percent",
      )
      .gte("date", DECA_SMG_SEASON.start)
      // A short opened on the last day has no next close inside the game.
      .lt("date", DECA_SMG_SEASON.end),
    fetchTreasuryNoteCloses(buyDate),
    ...MARKET_LONGS.map((l) => fetchDailyCloses(l.symbol, buyDate)),
  ]);
  const legs = [
    ...MARKET_LONGS.map((l, i) => ({ ...l, closes: histories[i] })),
    {
      symbol: BOND,
      name: note ? `10-year Treasury note, ${note.couponPct.toFixed(2)}% coupon` : "10-year Treasury note",
      assetClass: "Bond",
      closes: note?.closes ?? null,
    },
  ];
  if (theses.error) throw new Error(`track record read failed: ${theses.error.message}`);
  const rows = theses.data ?? [];

  const rec = buildTrackRecord(rows, {
    minScore: MIN_SCORE,
    startDate: DECA_SMG_SEASON.start,
    startingCash: STARTING_CASH,
    maxPosition: MAX_POSITION,
    commission: COMMISSION,
    minPrice: MIN_PRICE,
    untradeable: await underCapFloor(admin, rows),
    longs: {
      buyDate,
      minPerLeg: MIN_PER_CLASS,
      legs,
    },
  });
  const { stats } = rec;
  const longs = rec.longs!;
  const last = rec.points.at(-1)!;
  const sessions = rec.points.slice(1).reverse();
  const excludedFor = (reason: ExcludedReason) =>
    rec.excluded.filter((e) => e.reason === reason).map((e) => `${e.ticker} ${fmtDay(e.date)}`);
  const priceOut = excludedFor("price");
  const capOut = excludedFor("cap");

  const rules: { rule: string; deca: string; status: "Applied" | "Met" | "Not modeled"; here: string }[] = [
    {
      rule: "Max per security",
      deca: `20% of Total Equity × 1.5 = ${pct(MAX_POSITION)} in any one security, checked at the order`,
      status: "Applied",
      here: `Each short is ${pct(MAX_POSITION)} of the account or an even split, whichever is smaller. Largest taken: ${pct(stats.largestWeight)}.`,
    },
    {
      rule: "End-of-Day fills",
      deca: "Orders in market hours fill at that day's close; cancelable until 4 PM ET",
      status: "Applied",
      here: "Short at the scored day's close, cover at the next session's close.",
    },
    {
      rule: "$3 price floor",
      deca: `No short of a stock under $${MIN_PRICE} the day before or the day of the order`,
      status: "Applied",
      here: priceOut.length
        ? `Checked on both closes. Excluded: ${priceOut.join(", ")}.`
        : "Checked on both closes. No 7+ call has failed it.",
    },
    {
      rule: "$25M market cap",
      deca: `Minimum market cap $${MIN_MARKET_CAP / 1e6}M`,
      status: "Applied",
      here: capOut.length
        ? `Checked on the board row's previous-close cap; no cap data counts as a fail. Excluded: ${capOut.join(", ")}.`
        : "Checked on the board row's previous-close cap. No 7+ call has failed it.",
    },
    {
      rule: "Commission",
      deca: `$${COMMISSION} per transaction`,
      status: "Applied",
      here: `$${COMMISSION * 2} per position (short + cover), ${fmtUsd(stats.commissions)} so far.`,
    },
    {
      rule: "Minimum order",
      deca: "Short sells must be at least 10 shares",
      status: "Met",
      here:
        stats.fewestShares != null
          ? `Smallest short was ${stats.fewestShares.toLocaleString("en-US")} shares.`
          : "No shorts yet.",
    },
    {
      rule: "Margin",
      deca: "Margin account; may borrow 50% of Total Equity. No shorting in cash accounts",
      status: "Met",
      here: "Total short exposure tops out at 100% of the account (4+ calls × 25%), and the longs are paid from cash that short proceeds keep positive, so nothing is borrowed.",
    },
    {
      rule: "Interest",
      deca: "7%/yr charged on negative cash; 0.75%/yr credited on positive cash, weekly",
      status: "Not modeled",
      here: "Cash never goes negative (short proceeds are credited to it). The 0.75% credit is worth under half a percent over the season.",
    },
    {
      rule: "SEC fee",
      deca: "Charged on all sell transactions (a short sale is a sell)",
      status: "Not modeled",
      here: "A few dollars per $100k sold.",
    },
    {
      rule: "Diversification",
      deca: `${fmtUsd(MIN_PER_CLASS)} each in long stock, mutual funds and bonds by ${fmtDay(buyDate)}, held to the end; shorts don't count`,
      status: longs.positions.length === legs.length ? "Applied" : "Not modeled",
      here: longs.missing.length
        ? `No price history for ${longs.missing.join(", ")} — ${longs.positions.length ? "the account leaves it out" : "the account is the short sleeve alone"}.`
        : `${longs.positions.map((p) => p.symbol).join(", ")} bought at the ${fmtDay(buyDate)} close, whole shares rounded up past ${fmtUsd(MIN_PER_CLASS)} (${fmtUsd(longs.cost)} in all), plus ${fmtUsd(COMMISSION * longs.positions.length)} commission. They count in Total Equity, so later shorts are sized off them too.`,
    },
  ];

  const tiles = [
    {
      k: "Account value",
      v: fmtUsd(stats.equity),
      s: <span className={pnlClass(stats.returnPct)}>{fmtPct(stats.returnPct)} since {fmtDay(rec.startDate)}</span>,
    },
    {
      k: "Shorts won",
      v: stats.trades ? `${Math.round((100 * stats.wins) / stats.trades)}%` : "—",
      s: `${stats.wins} of ${stats.trades} trades`,
    },
    {
      k: "Max drawdown",
      v: `${stats.maxDrawdownPct.toFixed(1)}%`,
      s: "peak to trough, at closes",
    },
    {
      k: "Sessions shorting",
      v: `${stats.sessionsInMarket} of ${stats.sessions}`,
      s: `the rest had no ${MIN_SCORE}+ call`,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Engine · paper trade"
        title={`Shorting every ${MIN_SCORE}+ call`}
        description={`From ${fmtUsd(STARTING_CASH)} on ${fmtDay(rec.startDate)}, the DECA SMG open. Each session the account shorts that day's theses scored ${MIN_SCORE} or higher at the close, split evenly with no position over DECA's ${pct(MAX_POSITION)} limit, and covers at the next session's close — DECA's End-of-Day fills. At the ${fmtDay(buyDate)} diversification deadline it also bought ${fmtUsd(MIN_PER_CLASS)} each of SO, VFIAX and a 10-year Treasury note and holds them to the end. Played by the SMG rules below.`}
        unique="track-record"
        motif={false}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="glass min-w-0 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{t.k}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{t.v}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.s}</p>
          </div>
        ))}
      </section>

      <section className="glass rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Account value at each close</h2>
          <p className="font-mono text-xs text-muted-foreground">
            through {fmtDay(last.coverDate)} · updates ~4:20 PM ET each session
          </p>
        </div>
        {rec.points.length > 1 ? (
          <EquityCurve
            points={rec.points}
            startingCash={STARTING_CASH}
            marker={longs.positions.length ? { date: buyDate, label: "Diversified" } : undefined}
          />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">No settled sessions yet.</p>
        )}
        {stats.bustedOn && (
          <p className="mt-3 text-xs font-medium text-down">
            Account wiped out at the {fmtDay(stats.bustedOn)} close — the record stops there.
          </p>
        )}
        {stats.best && stats.worst && stats.equityWithoutBest != null && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Best trade {stats.best.ticker} ({fmtDay(stats.best.date)}, score {stats.best.score}){" "}
            <span className="text-up">{fmtPct(stats.best.pnl)}</span>; without it the account would be{" "}
            <span className="font-mono text-foreground">{fmtUsd(stats.equityWithoutBest)}</span>. Worst{" "}
            {stats.worst.ticker} ({fmtDay(stats.worst.date)}, score {stats.worst.score}){" "}
            <span className="text-down">{fmtPct(stats.worst.pnl)}</span>.
          </p>
        )}
      </section>

      {longs.positions.length > 0 && (
        <section className="glass overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
            <h2 className="text-sm font-semibold">
              Diversification longs {longs.bought ? `— bought ${fmtDay(buyDate)} close` : `— buy at the ${fmtDay(buyDate)} close`}
            </h2>
            {longs.bought && (
              <p className="font-mono text-xs text-muted-foreground">
                <span className={pnlClass(longs.pnl)}>{signedUsd(longs.pnl)}</span> on {fmtUsd(longs.cost)}
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[640px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium sm:pl-5">Class</th>
                  <th className="px-3 py-2 font-medium">Holding</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-right font-medium">Bought at</th>
                  <th className="px-3 py-2 text-right font-medium">Last close</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-right font-medium sm:pr-5">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {longs.positions.map((p) => (
                  <tr key={p.symbol} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-1.5 text-muted-foreground sm:pl-5">{p.assetClass}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{p.symbol}</span>{" "}
                      <span className="text-xs text-muted-foreground">{p.name}</span>
                    </td>
                    {/* The note is quoted the bond way: face held, price per 100 of face. */}
                    <td className="px-3 py-1.5 text-right font-mono">
                      {p.symbol === BOND ? `${fmtUsd(p.shares * 1000)} face` : p.shares}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {p.symbol === BOND ? (p.buyAt / 10).toFixed(2) : formatPrice(p.buyAt)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {p.symbol === BOND ? (p.lastAt / 10).toFixed(2) : formatPrice(p.lastAt)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtUsd(p.value)}</td>
                    <td className={`px-4 py-1.5 text-right font-mono sm:pr-5 ${pnlClass(p.pnl)}`}>
                      {signedUsd(p.pnl)} <span className="text-xs">{fmtPct(p.pnlPct)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-4 pt-2 text-xs leading-relaxed text-muted-foreground sm:px-5">
            The bond is a new 10-year Treasury note bought at par, its coupon set to that day&apos;s 10-year yield.
            No free source quotes one note&apos;s daily price, so it&apos;s repriced from Treasury&apos;s official
            10-year yield each session, priced per 100 of face. Its value includes interest earned so far; its
            first coupon falls after the game ends. Fund distributions aren&apos;t credited. A fund&apos;s NAV posts
            in the evening, so until it does the newest session carries the prior one.
          </p>
        </section>
      )}

      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
          <h2 className="text-sm font-semibold">DECA SMG rules this record plays by</h2>
          <a
            href={DECA_SMG_SEASON.rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            DECA Guide 2026-27, p. 113 ↗
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:pl-5">Rule</th>
                <th className="px-3 py-2 font-medium">DECA / SMG</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium sm:pr-5">In this record</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.rule} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-medium sm:pl-5">{r.rule}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.deca}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
                        r.status === "Not modeled"
                          ? "border-border text-muted-foreground"
                          : "border-brand/40 text-brand"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground sm:pr-5">{r.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {rec.open.length > 0 && (
        <section className="glass rounded-2xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Open — settles at the next close</h2>
          <p className="mt-1 font-mono text-sm">
            {rec.open.map((o) => `${o.ticker} (${o.score})`).join(" · ")}{" "}
            <span className="text-muted-foreground">· shorted {fmtDay(rec.open[0].date)}</span>
          </p>
        </section>
      )}

      <section className="glass overflow-hidden rounded-2xl">
        <h2 className="px-4 pt-4 text-sm font-semibold sm:px-5">Every session, newest first</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[780px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:pl-5">Shorted → covered</th>
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Short at</th>
                <th className="px-3 py-2 text-right font-medium">Cover at</th>
                <th className="px-3 py-2 text-right font-medium">Short P&amp;L</th>
                <th className="px-3 py-2 text-right font-medium">Longs</th>
                <th className="px-4 py-2 text-right font-medium sm:pr-5">Account</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((p) => {
                const rows = p.trades.length ? p.trades : [null];
                return rows.map((t, i) => (
                  <tr
                    key={p.scoredDate + (t?.ticker ?? "cash")}
                    className={i === rows.length - 1 ? "border-b border-border" : ""}
                  >
                    {i === 0 && (
                      <td rowSpan={rows.length} className="px-4 py-1.5 align-top font-mono text-xs text-muted-foreground sm:pl-5">
                        {fmtDay(p.scoredDate)} → {fmtDay(p.coverDate)}
                      </td>
                    )}
                    {t ? (
                      <>
                        <td className="px-3 py-1.5 font-medium">{t.ticker}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.score}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{Math.round(t.weight * 100)}%</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatPrice(t.shortAt)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatPrice(t.coverAt)}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${pnlClass(t.pnl)}`}>{fmtPct(t.pnl)}</td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-3 py-1.5 text-muted-foreground">
                        {p.longValue > 0 ? "No short" : "Cash"} — no {MIN_SCORE}+ call
                      </td>
                    )}
                    {i === 0 && (
                      <td rowSpan={rows.length} className="px-3 py-1.5 text-right align-top font-mono">
                        {p.longValue === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : p.scoredDate < buyDate ? (
                          <span className="text-xs text-brand">bought</span>
                        ) : (
                          <span className={pnlClass(p.longPnl)}>{signedUsd(p.longPnl)}</span>
                        )}
                      </td>
                    )}
                    {i === 0 && (
                      <td rowSpan={rows.length} className="px-4 py-1.5 text-right align-top font-mono sm:pr-5">
                        {fmtUsd(p.equity)}
                        {(p.trades.length > 0 || p.longValue > 0) && (
                          <span className={`block text-xs ${pnlClass(p.ret)}`}>{fmtPct(p.ret)}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Simulated, not traded. Session returns are net of commissions and include the longs. Returns compound: each
        session&apos;s size is the account after the previous one, and a loss past $0 ends the record rather
        than going negative (that floor is this page&apos;s rule, not DECA&apos;s). Source:{" "}
        <code className="font-mono">ai_analyses</code>, live.
        {rec.unresolved.length > 0 &&
          ` Excluded — no outcome recorded: ${rec.unresolved.map((u) => `${u.ticker} ${fmtDay(u.date)}`).join(", ")}.`}
      </p>
    </main>
  );
}
