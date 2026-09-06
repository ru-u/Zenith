import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { Disclaimer } from "@/components/legal/Disclaimer";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbNode } from "@/lib/schema";
import { tickerProfile, type TickerProfile } from "@/lib/tickerPages";
import { qualifiedSymbol } from "@/lib/marketdata/symbols";
import { formatDayLabel } from "@/lib/format";

// A public, aggregate profile of a ticker that keeps showing up on the board.
//
// Exists for search and for answer engines: the screener itself is one URL that
// changes every day, so before these there was nothing on the site for anyone
// to land on from a ticker or company-name query. Aggregates only — see the
// header comment in lib/tickerPages.ts for what these pages may not say and
// why.
//
// Deliberately NOT here: the price chart (account-gated everywhere else, and
// this page must not become the way around that) and the short thesis (Pro).

// Symbols are constrained the same way the rest of the app constrains them, so
// a walked URL can't reach the database with anything exotic.
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

async function load(raw: string): Promise<TickerProfile> {
  const ticker = decodeURIComponent(raw).toUpperCase();
  if (!TICKER_RE.test(ticker)) notFound();
  const profile = await tickerProfile(ticker);
  if (!profile) notFound();
  return profile;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  if (!TICKER_RE.test(ticker)) return {};
  const p = await tickerProfile(ticker);
  if (!p) return {};

  const name = p.companyName ?? p.ticker;
  return {
    // Kept short on purpose: the layout template appends " — Zenith Screener",
    // and Google truncates around 60 characters. Ticker + company name are the
    // two strings people actually search; the rest belongs in the description.
    title: `${p.ticker} — ${name}`,
    description: `${name} (${p.ticker}) has appeared on Zenith's daily top-gainers board ${p.appearances} times. Typical one-day gain, how often spikes like it faded, and what that means for a short.`,
    alternates: { canonical: `/stock/${p.ticker}` },
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: raw } = await params;
  const p = await load(raw);
  const name = p.companyName ?? p.ticker;
  const rate = p.baseRate;
  const downPct = rate ? Math.round(rate.down_rate * 100) : null;
  const medianNext =
    rate?.median_next_day_return != null
      ? rate.median_next_day_return * 100
      : null;

  return (
    <>
      <JsonLd
        data={breadcrumbNode([
          { name: "Tickers", path: "/stock" },
          { name: p.ticker, path: `/stock/${p.ticker}` },
        ])}
      />
      <LegalShell
        eyebrow={[p.exchange, p.sector].filter(Boolean).join(" · ") || "Ticker"}
        title={`${name} (${p.ticker})`}
        description={`How often ${p.ticker} has turned up among the day's biggest US gainers, and what has typically followed spikes like it.`}
        unique={`stock-${p.ticker}`}
        updated={formatDayLabel(p.lastDate)}
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Board days" value={String(p.appearances)} />
          <Stat
            label="Median gain"
            value={
              p.medianChangePercent != null
                ? `+${p.medianChangePercent.toFixed(1)}%`
                : "—"
            }
          />
          <Stat
            label="Best streak"
            value={p.bestStreak != null ? `${p.bestStreak}d` : "—"}
          />
          <Stat label="Symbol" value={qualifiedSymbol(p.exchange, p.ticker)} />
        </dl>

        <LegalSection title="What this is">
          <p>
            Zenith ranks the biggest one-day gainers on US markets every trading
            session. <strong>{name}</strong> has appeared on that board{" "}
            <strong>{p.appearances} times</strong> between{" "}
            {formatDayLabel(p.firstDate)} and {formatDayLabel(p.lastDate)}
            {p.medianChangePercent != null ? (
              <>
                , with a median one-day gain of{" "}
                <strong>+{p.medianChangePercent.toFixed(1)}%</strong> on the
                sessions it made the list
              </>
            ) : null}
            .
            {p.bestStreak != null && p.bestStreak > 1 ? (
              <>
                {" "}
                Its longest run of consecutive sessions on the board is{" "}
                <strong>{p.bestStreak} days</strong>.
              </>
            ) : null}
          </p>
          <p>
            Recurring on a top-gainers list is not by itself good or bad news.
            It means the stock moves a lot in single sessions, which is what
            makes it interesting to a short — and also what makes it dangerous
            to one.
          </p>
        </LegalSection>

        {rate && downPct != null ? (
          <LegalSection title="What has usually followed a spike like this">
            <p>
              Zenith groups past top-gainers by size and how unusual their
              volume was, then measures what happened the next session. In the
              bucket {p.ticker}&apos;s typical appearance falls into (n=
              {rate.n}), the stock closed <strong>lower the next session</strong>{" "}
              {downPct}% of the time
              {medianNext != null ? (
                <>
                  , with a median next-day move of{" "}
                  <strong>
                    {medianNext >= 0 ? "+" : ""}
                    {medianNext.toFixed(1)}%
                  </strong>
                </>
              ) : null}
              .
            </p>
            <p>
              <strong>
                That is a base rate across a population of past spikes, not a
                prediction about {p.ticker}.
              </strong>{" "}
              It describes what comparable setups did on average; any single
              stock can and does do the opposite. What the engine claims and
              where it gets things wrong is written up on{" "}
              <Link
                href="/engine"
                className="underline underline-offset-2 hover:text-foreground"
              >
                the engine page
              </Link>
              .
            </p>
          </LegalSection>
        ) : null}

        <LegalSection title="Where to look next">
          <p>
            <Link
              href="/screener"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Today&apos;s screener
            </Link>{" "}
            shows the current session&apos;s ranked gainers — whether {p.ticker}{" "}
            is on it right now depends on the day. A free account adds price
            charts and streak badges;{" "}
            <Link
              href="/upgrade"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Zenith Pro
            </Link>{" "}
            adds the daily short thesis on the top five.
          </p>
          <Disclaimer className="px-0 pt-1" />
        </LegalSection>
      </LegalShell>
    </>
  );
}
