"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Reveal } from "./Reveal";
import { StreakBadge } from "@/components/gainers/StreakBadge";
import { useAiAnalyses } from "@/hooks/useAiAnalyses";
import { useGainers } from "@/hooks/useGainers";
import { useStreaks } from "@/hooks/useStreaks";
import { formatDayLabel, formatPrice } from "@/lib/format";
import { digitsFor } from "./mystery";

// The hero's old live-data funnel, relocated: five rows as a flat wire panel.
// Tickers stay public; the SCORE stays the gated tease — blurred deterministic
// digits for free visitors (mystery.ts), the real short_score for Pro.
//
// WHICH five depends on the viewer, and the two sets are genuinely different:
//
//   free / pre-drop  the live gainer board (daily_gainers)
//   Pro, post-drop   the theses written at the ~3:30 drop (ai_analyses)
//
// This panel used to render the board and look scores up by ticker from the
// drop's set. That join can never be total: the day cap in lib/claude.ts makes
// the drop's five authoritative for the day, so tickers that climb into the
// finalized top five afterwards never get a thesis and rendered a bare "—"
// (2026-09-04: NX, PDEX and HVII, all legitimately top-5 at the close). A
// pre-close artifact and a post-close board describe different sets by design —
// so render one or the other, never a join of both.

/** The shape both sets collapse to. `changePercent` is always a GAIN here. */
interface PanelRow {
  ticker: string;
  companyName: string | null;
  changePercent: number | null;
  price: number | null;
  /** Real short_score — Pro on the drop's set only; null means "not scored yet". */
  score: number | null;
}

function ScoreCell({
  rank,
  dateKey,
  isPro,
  scored,
  score,
  loading,
}: {
  rank: number;
  dateKey: string;
  isPro: boolean;
  /** Whether the day's theses have landed (i.e. this row came from the drop). */
  scored: boolean;
  score: number | null;
  /** The Pro thesis query is still in flight — don't flash a dash at it. */
  loading: boolean;
}) {
  return (
    <span className="flex items-baseline justify-end gap-1">
      {isPro && loading ? (
        // First paint for a Pro viewer: the board is already cached but the
        // theses query has not resolved, so `scored` is still false. Showing a
        // dash here flashed "no score" for a beat on a day that HAS scores.
        <span className="h-3 w-4 animate-pulse rounded-sm bg-foreground/15 motion-reduce:animate-none" />
      ) : isPro ? (
        <span
          className="font-mono text-sm font-bold leading-none tabular-nums"
          // Pre-drop the honest answer is that nothing is scored yet, for
          // anyone — the only state where this dash is the truth.
          title={scored ? undefined : "Short scores post about 30 minutes before the close"}
        >
          {scored && score != null ? score : "—"}
        </span>
      ) : (
        <span
          className="font-mono text-sm font-bold leading-none tabular-nums blur-[4px] select-none"
          aria-hidden
        >
          {digitsFor(rank, dateKey)}
        </span>
      )}
      <span className="font-mono text-xs text-muted-foreground">/10</span>
      {!isPro && (
        <Lock
          role="img"
          className="ml-0.5 h-3 w-3 self-center text-muted-foreground/70"
          aria-label="Short score locked. Unlocks with Pro."
        />
      )}
    </span>
  );
}

function Row({
  row,
  rank,
  streak,
  dateKey,
  isPro,
  scored,
  loading,
}: {
  row: PanelRow;
  rank: number;
  streak?: number;
  dateKey: string;
  isPro: boolean;
  scored: boolean;
  loading: boolean;
}) {
  // NEVER coerce a missing figure to 0 — "+0.0%" reads as a real, flat session
  // rather than as "we don't have this". Theses scored before
  // change_percent_at_score existed have null here, and the whole point of this
  // panel's rewrite was to stop showing invented numbers.
  const change = row.changePercent;
  const decimals = change != null && Math.abs(change) >= 100 ? 0 : 1;
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/3 sm:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem_7rem_5.5rem] sm:gap-4 sm:px-6">
      <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">
        #{rank}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold tracking-tight">
            {row.ticker}
          </span>
          <StreakBadge count={streak} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.companyName ?? "—"}
        </span>
      </span>
      <span className="hidden sm:block">
        <ScoreCell
          rank={rank}
          dateKey={dateKey}
          isPro={isPro}
          scored={scored}
          score={row.score}
          loading={loading}
        />
      </span>
      {/* The "+" is hardcoded, and safe: both sets are gainers — the board is
          filtered to change > 0, and a thesis ticker was a top-5 gainer at the
          drop. Do NOT feed scored_day_change_percent through here; it is the
          ticker's actual CLOSE and can be deeply negative (AIFU 2026-09-04
          closed -18.58%), which would render as a green "+-18.6%". That figure
          belongs on /analysis, which renders it sign-aware. */}
      <span
        className={`text-right font-mono text-sm font-semibold tabular-nums ${
          change != null ? "text-up" : "text-muted-foreground"
        }`}
      >
        {change != null ? `+${change.toFixed(decimals)}%` : "—"}
      </span>
      <span className="hidden text-right font-mono text-sm text-muted-foreground tabular-nums sm:block">
        {formatPrice(row.price)}
      </span>
    </li>
  );
}

export function TopFive({ isPro }: { isPro: boolean }) {
  const { data } = useGainers();
  const { data: streaks } = useStreaks();
  // Not defaulted to [] here: a fresh array literal every render would
  // invalidate the useMemo below on every render. Defaulted inside instead.
  const board = data?.gainers;
  const dateKey = data?.date ?? "";

  // Drop-aware query (1-min poll until the day's theses land, focus refetch),
  // shared with AIAnalysisCard. Pro-gated at the route, so free visitors never
  // fetch it — which is also why they keep the public board below.
  const { data: analyses, isLoading: analysesLoading } = useAiAnalyses(
    dateKey || undefined,
    isPro,
  );

  // Ordering mirrors AIAnalysisCard: best→worst short, tie-broken on the stored
  // board rank. Kept identical on purpose — one drop, one order, two surfaces.
  const drop = useMemo(
    () =>
      [...(analyses ?? [])]
        .sort(
          (a, b) =>
            (b.short_score ?? -1) - (a.short_score ?? -1) ||
            (a.rank ?? 99) - (b.rank ?? 99),
        )
        .slice(0, 5),
    [analyses],
  );

  // Pro sees the scored set once it exists; everyone else (and Pro before the
  // ~3:30 drop) sees the live board.
  const scored = isPro && drop.length > 0;
  const rows: PanelRow[] = useMemo(
    () =>
      scored
        ? drop.map((a) => ({
            ticker: a.ticker,
            companyName: a.company_name,
            changePercent: a.change_percent_at_score,
            price: a.price_at_score,
            score: a.short_score,
          }))
        : (board ?? []).slice(0, 5).map((g) => ({
            ticker: g.ticker,
            companyName: g.company_name,
            changePercent: g.change_percent,
            price: g.price,
            score: null,
          })),
    [scored, drop, board],
  );

  const footnote = scored
    ? "The five theses from today's drop, ranked best→worst short."
    : isPro
      ? "Real data from the latest session. Short scores post about 30 minutes before the close."
      : "Real data from the latest session. Short scores unlock with Pro.";

  return (
    <section id="today" className="relative mx-auto w-full max-w-4xl px-6 pb-20">
      <Reveal>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-brand">
            {scored ? "The 3:30 drop" : "The session's top five"}
          </h2>
          {dateKey && (
            <span className="font-mono text-xs text-muted-foreground">
              {formatDayLabel(dateKey)}
            </span>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl bg-white/2 ring-1 ring-white/7 backdrop-blur-sm">
          {rows.length === 0 ? (
            <ul className="divide-y divide-white/5">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-4 py-3.5 sm:px-6">
                  <div className="h-9 animate-pulse rounded-md bg-white/4 motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((row, i) => (
                <Row
                  key={row.ticker}
                  row={row}
                  rank={i + 1}
                  streak={streaks?.get(row.ticker)}
                  dateKey={dateKey}
                  isPro={isPro}
                  scored={scored}
                  loading={analysesLoading}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <p>{footnote}</p>
          <Link
            href={scored ? "/analysis" : "/screener"}
            className="group inline-flex items-center gap-1 font-medium text-brand transition-colors hover:text-foreground"
          >
            {scored ? "Read the theses" : "Open the screener"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
