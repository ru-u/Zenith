import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DailyGainer } from "./supabase/types";
import type { GainerRow } from "./marketdata/types";
import { isLikelySplitArtifact, TICKER_RE } from "./marketdata/normalize";
import { isAllowedExchange } from "./marketdata/symbols";
import { maybeAlert } from "./alerts";
import {
  getMarketStatus,
  isDataStale,
  type MarketStatus,
} from "./market-calendar";

/** Map a normalized provider row to a daily_gainers insert. */
function toDbRow(row: GainerRow, dateKey: string, isFinal: boolean, scrapedAt: string) {
  return {
    date: dateKey,
    ticker: row.ticker,
    exchange: row.exchange,
    company_name: row.companyName,
    price: row.price,
    change_percent: row.changePercent,
    // volume / market_cap may be integer-typed columns; providers can return
    // fractional values. Round to be safe (fractional cents are irrelevant here).
    volume: row.volume == null ? null : Math.round(row.volume),
    relative_volume: row.relativeVolume,
    market_cap: row.marketCap == null ? null : Math.round(row.marketCap),
    sector: row.sector,
    rank: row.rank,
    is_final: isFinal,
    scraped_at: scrapedAt,
  };
}

/**
 * Symbol-integrity gate at the ingest boundary. Every row we store must be
 * unambiguously identifiable, or downstream consumers (chart embeds, EDGAR,
 * Finnhub) resolve the bare ticker string to some other instrument that shares
 * it (the BIOT incident: a day-one Nasdaq listing whose bare symbol resolved
 * to a BitMEX crypto index in the chart widget). Rows with a malformed ticker
 * or an unexpected venue are dropped; rows missing the exchange entirely are
 * kept (a provider swap must not blank the product) but flagged. Either case
 * fires one deduped ops alert — this should never happen while the provider's
 * own exchange filter holds, so any hit means the upstream contract changed.
 */
function checkSymbolIntegrity(rows: GainerRow[]): {
  kept: GainerRow[];
  dropped: GainerRow[];
  unqualified: GainerRow[];
} {
  const dropped = rows.filter(
    (r) =>
      !TICKER_RE.test(r.ticker) ||
      (r.exchange != null && !isAllowedExchange(r.exchange)),
  );
  const kept =
    dropped.length === 0
      ? rows
      : rows
          .filter((r) => !dropped.includes(r))
          .map((r, i) => ({ ...r, rank: i + 1 }));
  return { kept, dropped, unqualified: kept.filter((r) => r.exchange == null) };
}

/**
 * Tickers that already have an AI thesis for this date. The pre-close drop
 * writes theses off the 15:30 board, so a ticker can be top-5 then and gone
 * from the board by the finalize scrape — AEHL on 2026-08-31 straddled the
 * $25M market-cap floor (3.9M shares outstanding put the cutoff at a $6.47
 * share price) and was filtered out at 16:10, after which the prune deleted
 * the row its thesis pointed at. The Analysis tab then advertises a stock the
 * screener doesn't list. These stay pinned for the day regardless of rank.
 * Returns null if the lookup fails — the caller skips the prune rather than
 * guess.
 */
async function tickersWithTheses(
  admin: SupabaseClient<Database>,
  dateKey: string,
): Promise<string[] | null> {
  const { data, error } = await admin
    .from("ai_analyses")
    .select("ticker")
    .eq("date", dateKey);
  if (error) {
    console.error("[gainers] thesis pin lookup failed:", error.message);
    return null;
  }
  // Interpolated into a PostgREST filter list below — admit only well-formed
  // tickers, matching the ingest gate.
  return (data ?? []).map((r) => r.ticker).filter((t) => TICKER_RE.test(t));
}

/** Upsert a ranked set of gainers for a date. Uses the service-role client. */
export async function persistGainers(
  admin: SupabaseClient<Database>,
  allRows: GainerRow[],
  dateKey: string,
  isFinal: boolean,
): Promise<void> {
  if (allRows.length === 0) return;

  const { kept: rows, dropped, unqualified } = checkSymbolIntegrity(allRows);
  if (dropped.length > 0 || unqualified.length > 0) {
    const label = (r: GainerRow) => `${r.exchange ?? "?"}:${r.ticker}`;
    console.error(
      `[gainers] symbol integrity: dropped [${dropped.map(label).join(", ")}], missing exchange [${unqualified.map(label).join(", ")}]`,
    );
    await maybeAlert(admin, {
      date: dateKey,
      type: "symbol_integrity",
      subject: `Zenith: ${dropped.length} gainer row(s) failed symbol integrity (${dateKey})`,
      body:
        `The scanner returned rows the ingest gate couldn't safely qualify.\n\n` +
        `Dropped (bad ticker/venue): ${dropped.map(label).join(", ") || "none"}\n` +
        `Kept but missing exchange: ${unqualified.map(label).join(", ") || "none"}\n\n` +
        `The provider's NASDAQ/NYSE filter should make this impossible — check whether ` +
        `the TradingView scanner contract changed (lib/marketdata/tradingview.ts).`,
    });
  }
  if (rows.length === 0) return;

  const scrapedAt = new Date().toISOString();
  const dbRows = rows.map((r) => toDbRow(r, dateKey, isFinal, scrapedAt));
  const { error } = await admin
    .from("daily_gainers")
    .upsert(dbRows, { onConflict: "date,ticker" });
  if (error) throw error;

  // Self-prune: remove rows for this date whose ticker fell out of the current
  // ranked set (the top-N shifts intraday, and upsert leaves orphans). Guarded
  // so a thin/failed fetch can't wipe the table.
  if (rows.length >= 10) {
    const pinned = await tickersWithTheses(admin, dateKey);
    // Couldn't read the theses — skip the prune entirely rather than risk
    // deleting a thesis's row. Orphan rows are cosmetic; an orphan thesis isn't.
    if (pinned == null) return;
    const keep = [...new Set([...rows.map((r) => r.ticker), ...pinned])];
    const { error: pruneError } = await admin
      .from("daily_gainers")
      .delete()
      .eq("date", dateKey)
      .not("ticker", "in", `(${keep.join(",")})`);
    if (pruneError) {
      console.error("[gainers] prune failed:", pruneError.message);
    }
  }
}

/** Read cached gainers for a date, ranked. */
export async function getCachedGainers(
  client: SupabaseClient<Database>,
  dateKey: string,
): Promise<DailyGainer[]> {
  const { data, error } = await client
    .from("daily_gainers")
    .select("*")
    .eq("date", dateKey)
    .order("rank", { ascending: true })
    // Tiebreak: a ticker pinned by `tickersWithTheses` keeps the rank it held
    // at the scrape that last saw it, so it can collide with a later row's
    // rank. Change% desc makes that order deterministic and correct — the
    // pinned row was, by definition, out-gaining whatever inherited its rank.
    .order("change_percent", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Most recent date that has stored gainers (for non-trading-day fallback). */
export async function getLatestGainersDate(
  client: SupabaseClient<Database>,
): Promise<string | null> {
  const { data } = await client
    .from("daily_gainers")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle<{ date: string }>();
  return data?.date ?? null;
}

function near(a: number | null, b: number | null, eps: number): boolean {
  return a != null && b != null && Math.abs(a - b) < eps;
}

/**
 * Drop "frozen repeats": a halted / non-trading stock keeps reporting the exact
 * same price, change%, and volume day after day (e.g. INHD after an SEC halt),
 * so it re-appears as the top gainer and accrues fake streaks. If a ticker's
 * price + change% + volume all match the prior trading day, it didn't actually
 * move today — exclude it and re-rank. (Three-field match makes false positives
 * effectively impossible for a stock that genuinely traded.)
 */
export function dropFrozenRepeats(
  rows: DailyGainer[],
  prev: DailyGainer[],
): DailyGainer[] {
  if (prev.length === 0) return rows;
  const prevByTicker = new Map(prev.map((p) => [p.ticker, p]));
  return rows
    .filter((r) => {
      const p = prevByTicker.get(r.ticker);
      if (!p) return true;
      const frozen =
        near(r.price, p.price, 0.01) &&
        near(r.change_percent, p.change_percent, 0.1) &&
        r.volume != null &&
        p.volume != null &&
        Math.round(r.volume) === Math.round(p.volume);
      return !frozen;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Drop reverse-split artifacts from stored rows and re-rank. New fetches are
 * already filtered in rankAndFilter; this heals rows persisted before the
 * guard existed (e.g. ENLV 2026-07-09: a 15:1 reverse split stored as +1414%).
 */
export function dropSplitArtifacts(rows: DailyGainer[]): DailyGainer[] {
  const kept = rows.filter(
    (r) => !isLikelySplitArtifact(r.change_percent, r.relative_volume),
  );
  if (kept.length === rows.length) return rows;
  return kept.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Most recent stored date strictly before `date`, or null. */
export async function getGainersDateBefore(
  client: SupabaseClient<Database>,
  date: string,
): Promise<string | null> {
  const { data } = await client
    .from("daily_gainers")
    .select("date")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle<{ date: string }>();
  return data?.date ?? null;
}

/**
 * Cleaned, re-ranked gainers for a date — split artifacts dropped, then the
 * frozen-repeat filter applied vs the prior trading day. Raw rows stay in the
 * DB (so the day-over-day chain keeps working); cleaning happens on read.
 */
export async function getCleanedGainers(
  client: SupabaseClient<Database>,
  date: string,
): Promise<DailyGainer[]> {
  const rows = await getCachedGainers(client, date);
  if (rows.length === 0) return rows;
  const prevDate = await getGainersDateBefore(client, date);
  const prev = prevDate ? await getCachedGainers(client, prevDate) : [];
  return dropFrozenRepeats(dropSplitArtifacts(rows), prev);
}

/** Most recent scraped_at among a date's rows (drives the freshness check). */
export function latestScrapedAt(rows: DailyGainer[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (!latest || r.scraped_at > latest) latest = r.scraped_at;
  }
  return latest;
}

/** Minutes before stored data counts as stale. Shared so the API route and any
 *  server-side prefetch report the same freshness. */
export const FRESHNESS_MINUTES = 10;

export interface GainersPayload {
  date: string;
  asOf: string | null;
  stale: boolean;
  status: MarketStatus;
  gainers: DailyGainer[];
}

/**
 * The side-effect-free half of `GET /api/gainers`: given what's already in the
 * database, pick the day to serve, clean it, and shape the response.
 *
 * Split out so a server render can seed the client cache without going near
 * the rest of that route — which refreshes from the provider, freezes the
 * official close, and triggers the pre-close drop. Those must stay on the
 * request path and off the render path (a render firing provider calls is a
 * bug this codebase has already had once). Everything here is reads.
 *
 * `seed` lets the route pass rows it has just refreshed, so the two callers
 * share this logic instead of keeping parallel copies of it.
 */
export async function serveStoredGainers(
  client: SupabaseClient<Database>,
  dateKey: string,
  seed?: { rows: DailyGainer[]; asOf: string | null },
): Promise<GainersPayload> {
  let servedDate = dateKey;
  let rows = seed ? seed.rows : await getCachedGainers(client, dateKey);
  let asOf = seed ? seed.asOf : latestScrapedAt(rows);

  // Nothing for today (weekend/holiday/before the first scrape of a new day) —
  // serve the most recent stored day so the page isn't empty, WITHOUT creating
  // a row for a non-trading day.
  if (rows.length === 0) {
    const latest = await getLatestGainersDate(client);
    if (latest && latest !== dateKey) {
      rows = await getCachedGainers(client, latest);
      asOf = latestScrapedAt(rows);
      servedDate = latest;
    }
  }

  // Drop reverse-split artifacts stored before the ingestion guard existed,
  // then frozen repeats (e.g. a halted stock reporting identical values daily)
  // vs the prior trading day.
  rows = dropSplitArtifacts(rows);
  const prevDate = await getGainersDateBefore(client, servedDate);
  if (prevDate) {
    rows = dropFrozenRepeats(rows, await getCachedGainers(client, prevDate));
  }

  return {
    date: servedDate,
    asOf,
    stale: isDataStale(asOf, FRESHNESS_MINUTES),
    status: getMarketStatus({
      isFinal: rows.some((r) => r.is_final),
      scrapedAt: asOf,
      isToday: servedDate === dateKey,
    }),
    gainers: rows,
  };
}
