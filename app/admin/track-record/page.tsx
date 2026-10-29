import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DECA_SMG_SEASON } from "@/lib/deca";
import { buildTrackRecord, tradeKey } from "@/lib/trackRecord";
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
// DECA SMG's starting balance.
const STARTING_CASH = 100_000;
// Largest share of the account in any one short — ours, not DECA's; see
// lib/trackRecord.ts. At 50% it only binds on single-call sessions, the case
// that took the uncapped account below zero.
const MAX_POSITION = 0.5;

const pnlClass = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "");

// Awaits at the top on purpose, unlike /analysis: the gate must run BEFORE any
// byte streams. notFound() thrown inside a Suspense boundary after the shell has
// flushed still returns 200 with this page's header, which confirms the route.
export default async function TrackRecordPage() {
  const { user } = await getViewer();
  if (!isAdmin(user)) notFound();

  const admin = createAdminClient();
  const [theses, uncapped] = await Promise.all([
    admin
      .from("ai_analyses")
      .select("date, ticker, rank, short_score, next_date, scored_day_close, next_close, next_change_percent")
      .gte("date", DECA_SMG_SEASON.start)
      // A short opened on the last day has no next close inside the game.
      .lt("date", DECA_SMG_SEASON.end),
    // No market cap on the board row → DECA's $25M floor can't be met, so the
    // call couldn't have been placed (AIOK, Oct 2026). An explicit null only: a
    // thesis ticker that later left the board has no row and stays in.
    admin
      .from("daily_gainers")
      .select("date, ticker")
      .is("market_cap", null)
      .gte("date", DECA_SMG_SEASON.start)
      .lt("date", DECA_SMG_SEASON.end),
  ]);
  if (theses.error) throw new Error(`track record read failed: ${theses.error.message}`);
  if (uncapped.error) throw new Error(`track record read failed: ${uncapped.error.message}`);

  const rec = buildTrackRecord(theses.data ?? [], {
    minScore: MIN_SCORE,
    startDate: DECA_SMG_SEASON.start,
    startingCash: STARTING_CASH,
    maxPosition: MAX_POSITION,
    untradeable: new Set((uncapped.data ?? []).map((r) => tradeKey(r.date, r.ticker))),
  });
  const { stats } = rec;
  const last = rec.points.at(-1)!;
  const sessions = rec.points.slice(1).reverse();

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
      k: "Sessions in market",
      v: `${stats.sessionsInMarket} of ${stats.sessions}`,
      s: "the rest had no 7+ call",
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Engine · paper trade"
        title={`Shorting every ${MIN_SCORE}+ call`}
        description={`From ${fmtUsd(STARTING_CASH)} on ${fmtDay(rec.startDate)}, the DECA SMG open. Each session the account shorts that day's theses scored ${MIN_SCORE} or higher at the close, split evenly with no position over ${Math.round(MAX_POSITION * 100)}% of the account, and covers at the next session's close — DECA's End-of-Day fills. Whatever isn't shorted sits in cash.`}
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
          <EquityCurve points={rec.points} startingCash={STARTING_CASH} />
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
          <table className="mt-2 w-full min-w-[700px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:pl-5">Shorted → covered</th>
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Short at</th>
                <th className="px-3 py-2 text-right font-medium">Cover at</th>
                <th className="px-3 py-2 text-right font-medium">Short P&amp;L</th>
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
                        Cash — no {MIN_SCORE}+ call
                      </td>
                    )}
                    {i === 0 && (
                      <td rowSpan={rows.length} className="px-4 py-1.5 text-right align-top font-mono sm:pr-5">
                        {fmtUsd(p.equity)}
                        {p.trades.length > 0 && (
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
        Simulated, not traded. No borrow fees or commissions. The {Math.round(MAX_POSITION * 100)}% position
        cap is this page&apos;s rule, not DECA&apos;s. Returns compound: each session&apos;s size is the account
        after the previous one, and a loss past $0 ends the record rather than going negative. Source:{" "}
        <code className="font-mono">ai_analyses</code>, live.
        {rec.excluded.length > 0 &&
          ` Excluded — no market-cap data, so not tradeable in DECA: ${rec.excluded.map((u) => `${u.ticker} ${fmtDay(u.date)}`).join(", ")}.`}
        {rec.unresolved.length > 0 &&
          ` Excluded — no outcome recorded: ${rec.unresolved.map((u) => `${u.ticker} ${fmtDay(u.date)}`).join(", ")}.`}
      </p>
    </main>
  );
}
