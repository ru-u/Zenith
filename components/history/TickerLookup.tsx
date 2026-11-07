"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lock, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSubscription } from "@/hooks/useSubscription";
import { BOARD_ROWS } from "@/lib/board";
import { formatDayLabel, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TickerHistory } from "@/lib/tickerHistory";

// Mirrors TICKER_RE in lib/marketdata/normalize.ts — the shape persistGainers
// enforces, so anything else can never have been on the board. Not imported:
// that module is server-side provider code.
const TICKER_SHAPE = /^[A-Z]{1,4}$/;

type LookupResult =
  | { status: 200; history: TickerHistory }
  | { status: 403 };

async function fetchTickerHistory(ticker: string): Promise<LookupResult> {
  const res = await fetch(`/api/gainers/ticker/${encodeURIComponent(ticker)}`);
  if (res.status === 403) return { status: 403 };
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return { status: 200, history: (await res.json()) as TickerHistory };
}

/**
 * Pro: every past session a ticker made the board, each one a jump to that
 * date's board below. Free accounts see the box and get the upsell on submit —
 * no request, since useSubscription already knows the tier — and the route
 * enforces the gate regardless.
 */
export function TickerLookup({
  activeDate,
  onPick,
  onClear,
}: {
  activeDate: string | null;
  onPick: (date: string, ticker: string) => void;
  onClear: () => void;
}) {
  const { isPro, loading: tierLoading } = useSubscription();
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ticker-history", ticker],
    queryFn: () => fetchTickerHistory(ticker as string),
    enabled: !!ticker && isPro,
    // Past sessions only, so a result changes at most once a day.
    staleTime: 30 * 60 * 1000,
    refetchInterval: false,
    retry: 1,
  });

  const typed = input.trim().toUpperCase();
  const valid = TICKER_SHAPE.test(typed);

  const clear = () => {
    setTicker(null);
    setInput("");
    onClear();
  };

  const locked = ticker && !tierLoading && (!isPro || data?.status === 403);
  const history = data?.status === 200 ? data.history : null;

  return (
    <section className="glass rounded-2xl p-3" aria-label="Ticker lookup">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setTicker(typed);
        }}
      >
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={input}
            onChange={(e) =>
              setInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
            }
            maxLength={4}
            placeholder="Look up a ticker, e.g. NUR"
            aria-label="Ticker symbol"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            // 44px on touch, matching the date chips beside it.
            className="h-11 pl-8 pointer-fine:h-9"
          />
        </div>
        <span className="hidden shrink-0 rounded-md bg-brand/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-brand uppercase sm:inline">
          Pro
        </span>
        <button
          type="submit"
          disabled={!valid}
          className="h-11 shrink-0 rounded-lg bg-brand btn-brand px-4 text-sm font-semibold text-brand-foreground transition-opacity disabled:opacity-40 pointer-fine:h-9"
        >
          Look up
        </button>
      </form>

      {ticker && (
        <div className="mt-3 border-t border-foreground/5 pt-3">
          {locked ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <span className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand">
                <Lock className="h-4 w-4" />
              </span>
              <p className="flex-1 text-sm text-muted-foreground">
                Ticker lookup is a Pro feature: every past session {ticker} made
                the top {BOARD_ROWS}, with its rank and gain that day.
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href="/upgrade"
                  className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
                >
                  Upgrade to Pro
                </Link>
                <ClearButton onClick={clear} />
              </div>
            </div>
          ) : isLoading || tierLoading ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Searching every past session for {ticker}…
            </p>
          ) : isError ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load {ticker}&apos;s history. Try again in a moment.
              </p>
              <ClearButton onClick={clear} />
            </div>
          ) : history ? (
            <>
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm" aria-live="polite">
                  <span className="font-semibold">{history.ticker}</span>
                  {history.companyName && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {history.companyName}
                    </span>
                  )}
                  <span className="block text-muted-foreground">
                    {history.appearances.length === 0
                      ? `Hasn't made the top ${BOARD_ROWS} on any past session.`
                      : `Made the top ${BOARD_ROWS} on ${history.appearances.length} past ${
                          history.appearances.length === 1 ? "session" : "sessions"
                        }. Tap one to open that day's board.`}
                  </span>
                </p>
                <ClearButton onClick={clear} />
              </div>

              {history.appearances.length > 0 && (
                // overscroll-y-contain: the same scroll-chaining fix as the
                // date strip, on this list's own axis.
                <ul className="max-h-64 overflow-y-auto overscroll-y-contain rounded-xl">
                  {history.appearances.map((a) => (
                    <li key={a.date}>
                      <button
                        type="button"
                        onClick={() => onPick(a.date, history.ticker)}
                        aria-current={a.date === activeDate ? "true" : undefined}
                        className={cn(
                          "grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg px-3 py-3 text-left text-sm tabular-nums transition-colors pointer-fine:py-2 sm:grid-cols-[1fr_auto_auto_auto]",
                          a.date === activeDate
                            ? "bg-brand/20"
                            : "hover:bg-foreground/5",
                        )}
                      >
                        <span>{formatDayLabel(a.date)}</span>
                        <span className="text-muted-foreground">#{a.rank}</span>
                        <span className="hidden text-right text-muted-foreground sm:inline">
                          {formatPrice(a.price)}
                        </span>
                        <span
                          className={cn(
                            "min-w-18 text-right font-semibold",
                            (a.change_percent ?? 0) < 0 && "text-down",
                          )}
                        >
                          {formatPercent(a.change_percent)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Clear ticker lookup"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
