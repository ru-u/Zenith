// The thesis engine's orchestrator. Historically this file WAS the Anthropic
// call (Haiku + web-search per ticker); it now drives the free in-house quant
// engine in lib/quant/ — EDGAR catalyst detection, base-rate/rule scoring,
// TradingView technicals, prose — and contains no Anthropic call of its own.
//
// The single Anthropic surface in the whole repo is lib/quant/thesis.ts, which
// this file reaches only through generateThesisText(). That call happens when
// AI_PROSE_MODE=model AND AI_THESES_ENABLED=true; it writes the narrative half
// of a thesis and never the figures. It is off by default, and everything here
// runs unchanged with it off.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GainerRow } from "@/lib/marketdata/types";
import type { Database } from "@/lib/supabase/types";
import { maybeAlert } from "@/lib/alerts";
import {
  dayRangePct,
  expectedMovePercent,
  resolveBaseRate,
  type BaseRate,
} from "@/lib/baseRates";
import { detectCatalyst } from "./quant/edgar";
import { detectNewsCatalyst } from "./quant/news";
import { fetchEarningsSurprise } from "./quant/earnings";
import { fetchTechnicals, type Technicals } from "./quant/technicals";
import { scoreShort } from "./quant/score";
import { effectiveAgeDays, isRecentListing } from "./quant/listing";
import {
  buildFeatureSnapshots,
  type FeatureSnapshot,
  type SectorContext,
} from "./quant/features";
import {
  activeProseMode,
  ANALYSIS_MODEL,
  generateThesisText,
  PROSE_BUDGET_MS,
  type ProseSource,
} from "./quant/thesis";

// The spend switch + model id live with the only code that can spend now.
export { aiThesesEnabled, ANALYSIS_MODEL } from "./quant/thesis";

// Versions the scoring rules in the stored `model` column so rows stay
// comparable when the Δ weights are re-tuned. Bump on scoring changes.
// v2: pinned-tape cap + expected-move/level-context prose + feature capture.
// v3: macro/sector-move class + ≤4 cap (SKYQ 2026-07-23: oil spiked on Middle
//     East strikes, no filing → the engine called it hype and scored 8/10).
const QUANT_VERSION = "quant-v3";

// Catalyst classification — drives shortability (a buyout pins; a parabolic runner fades).
const CATALYST_TYPES = [
  "buyout",
  "earnings",
  "offering",
  "regulatory",
  "partnership",
  "meme_squeeze",
  "macro",
  "other",
] as const;

export interface AnalysisResult {
  short_thesis: string;
  catalyst: string;
  catalyst_url: string;
  catalyst_type: string;
  short_score: number;
  percent_win_estimate: number;
  expected_move_percent: number | null;
  /** What actually wrote the prose. Drives the stored `model` value, so a model
   *  call that failed and fell back is never recorded as a model-written row. */
  prose_source: ProseSource;
}

// Defensive coercion at the storage boundary, kept from the LLM era — the
// quant engine emits valid values by construction, but this stays cheap
// insurance for any future findings source.
function normalizeCatalystType(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  if ((CATALYST_TYPES as readonly string[]).includes(s)) return s;
  if (/(buy|acqui|merger|m&a|take-?private|deal to be acquired)/.test(s)) return "buyout";
  if (/earn|guidance|results/.test(s)) return "earnings";
  if (/offer|dilut|raise|atm/.test(s)) return "offering";
  if (/fda|regulat|approval|trial|phase \d/.test(s)) return "regulatory";
  if (/partner|contract|collab/.test(s)) return "partnership";
  if (/meme|squeeze|reddit|social/.test(s)) return "meme_squeeze";
  if (/macro|sector|commodity|market-?wide/.test(s)) return "macro";
  return "other";
}

/** Honest "why it spiked" when the driver is the sector, not the company. */
function macroCatalystLine(ticker: string, ctx: SectorContext): string {
  const best = ctx.proxy_moves
    .filter((m) => m.change_pct > 0)
    .sort((a, b) => b.change_pct - a.change_pct)[0];
  const evidence = best
    ? `${best.symbol} is up ${best.change_pct.toFixed(1)}% today`
    : `${ctx.same_sector_on_board} ${ctx.sector} names are on today's gainer board`;
  return `${ticker} moved with its sector (${ctx.sector}) — ${evidence} — a macro-driven move rather than a company-specific catalyst.`;
}

// Round + clamp into [lo, hi]; fall back on garbage.
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** Generate a structured next-day short thesis for one gainer. Null on failure. */
export async function generateAnalysis(
  g: GainerRow,
  dateKey: string,
  streakCount: number | null,
  baseRate: BaseRate | null,
  tech: Technicals | null,
  snapshot: FeatureSnapshot | null = null,
  /** Epoch-ms ceiling shared across the batch's prose calls; see PROSE_BUDGET_MS. */
  proseDeadline: number = Number.POSITIVE_INFINITY,
): Promise<AnalysisResult | null> {
  try {
    // EDGAR is authoritative; headlines only fill the gap when no filing says
    // anything (deals announced by press release before the 8-K arrives).
    // Both degrade to null on their own — null means "nothing decisive" and
    // the score falls back to price-action + base rate.
    const edgarCat = await detectCatalyst(g.ticker, dateKey, g.companyName ?? null);
    const cat =
      edgarCat ?? (await detectNewsCatalyst(g.ticker, dateKey, g.companyName ?? null));
    // No company-specific catalyst but the whole sector is in motion → the
    // spike has macro fuel (oil, metals…), not hype. A real filing/headline
    // always wins; the sector context then stays capture-only.
    const sectorCtx = snapshot?.sector ?? null;
    const macroLine =
      !cat && sectorCtx?.is_sector_move ? macroCatalystLine(g.ticker, sectorCtx) : null;
    const catalyst_type = macroLine
      ? "macro"
      : normalizeCatalystType(cat?.catalyst_type ?? "other");
    const scored = scoreShort(
      g,
      streakCount,
      baseRate,
      catalyst_type,
      tech,
      snapshot?.pinned_tape.pinned ?? false,
      isRecentListing(snapshot?.listing ?? null),
    );
    // Actual vs consensus EPS, so neither renderer has to infer from the size of
    // the spike whether the results were good. EDGAR-confirmed earnings ONLY:
    // that path has already cross-checked the SEC registrant against the
    // scanner's company name (lib/quant/identity.ts), and Finnhub's earnings
    // endpoint — unlike its headlines — returns nothing to identity-check a bare
    // ticker against. Degrades to null, which just omits the figures.
    const earnings =
      edgarCat && catalyst_type === "earnings"
        ? await fetchEarningsSurprise(g.ticker, dateKey)
        : null;

    const expected_move_percent = expectedMovePercent(scored.percent_win_estimate, baseRate);
    const prose = await generateThesisText(
      {
        g,
        catalyst: cat?.catalyst ?? macroLine,
        catalystType: catalyst_type,
        streakCount,
        baseRate,
        tech,
        shortScore: scored.short_score,
        percentWin: scored.percent_win_estimate,
        expectedMove: expected_move_percent,
        path: snapshot?.path ?? null,
        listingAgeDays: effectiveAgeDays(snapshot?.listing ?? null),
        priorCall: snapshot?.prior_call ?? null,
        earnings,
      },
      proseDeadline,
    );
    return {
      catalyst:
        cat?.catalyst ??
        macroLine ??
        `No fresh SEC filing found for ${g.ticker} — the move looks driven by momentum, social buzz, or news outside official filings.`,
      catalyst_url: cat?.catalyst_url ?? "",
      catalyst_type,
      short_thesis: prose.text,
      short_score: clampInt(scored.short_score, 1, 10, 5),
      percent_win_estimate: clampInt(scored.percent_win_estimate, 0, 100, 50),
      expected_move_percent,
      prose_source: prose.source,
    };
  } catch (err) {
    console.error(`[quant] analysis failed for ${g.ticker}:`, (err as Error).message);
    return null;
  }
}

/**
 * Generate + store theses for the top `count` gainers of a day, skipping any
 * that already exist. `streaks` maps ticker -> prior-day streak count;
 * `baseRateTable` is the raw bucket table — priors are resolved here rather
 * than by the caller, because the magnitude dimension needs today's intraday
 * range, which only exists once the technicals fetch below has run. Called from the
 * pre-close drop / EOD. Free to run (no Anthropic spend in the default
 * template mode), so it is NOT behind the AI_THESES_ENABLED switch.
 * Returns the number created.
 */
export async function generateAndStoreTopAnalyses(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
  streaks: Map<string, number>,
  baseRateTable: BaseRate[],
  count = 5,
): Promise<number> {
  const top = gainers.slice(0, count);
  if (top.length === 0) return 0;

  // Day-level cap: once `count` theses exist for this date, never generate more.
  // The board's #5 slot churns between the ~3:30 pre-close drop and the EOD
  // finalize; without this, each new #5 gets appended and we accumulate >5 rows
  // per day. The first complete set (the drop) is authoritative.
  const { count: existingCount } = await admin
    .from("ai_analyses")
    .select("*", { count: "exact", head: true })
    .eq("date", dateKey);
  let remaining = count - (existingCount ?? 0);
  if (remaining <= 0) return 0;

  const { data: existing } = await admin
    .from("ai_analyses")
    .select("ticker")
    .eq("date", dateKey)
    .in(
      "ticker",
      top.map((g) => g.ticker),
    );
  const have = new Set((existing ?? []).map((r) => r.ticker));

  // One scanner call covers every ticker; failure yields an empty map and
  // scoring proceeds on catalyst + base rate alone.
  const techs = await fetchTechnicals(
    top.map((g) => ({ ticker: g.ticker, exchange: g.exchange })),
  );

  // Resolve each prior now that intraday high/low are in hand. A ticker whose
  // technicals failed has no range band and falls through to the cap×relvol
  // bucket — identical to the pre-magnitude behaviour, never a guess.
  const baseRates = new Map<string, BaseRate | null>();
  for (const g of top) {
    const t = techs.get(g.ticker) ?? null;
    baseRates.set(
      g.ticker,
      resolveBaseRate(
        baseRateTable,
        g.marketCap,
        g.relativeVolume,
        dayRangePct(t?.dayHigh, t?.dayLow),
      ),
    );
  }

  // Candidate-signal snapshots (levels, serial-runner, FINRA, pinned tape) —
  // stored with each thesis for the September re-fit. Only `pinned` feeds
  // scoring (the safety cap); every input degrades independently.
  const snapshots = await buildFeatureSnapshots(admin, top, dateKey, techs, streaks, baseRates);

  // Shared wall-clock budget for the whole batch's prose. Only bites in model
  // mode; in template mode nothing reads it.
  const proseDeadline = Date.now() + PROSE_BUDGET_MS;
  let modelRows = 0;

  let created = 0;
  for (const g of top) {
    if (remaining <= 0) break; // never exceed the day cap
    if (have.has(g.ticker)) continue;
    const snapshot = snapshots.get(g.ticker) ?? null;
    const a = await generateAnalysis(
      g,
      dateKey,
      streaks.get(g.ticker) ?? null,
      baseRates.get(g.ticker) ?? null,
      techs.get(g.ticker) ?? null,
      snapshot,
      proseDeadline,
    );
    if (!a) continue;
    // Self-describing rows: the scoring version, plus the prose source THIS row
    // actually used. Computed per row on purpose — it used to be computed once
    // per batch from activeProseMode(), which meant a run where every Anthropic
    // call failed still stamped all five rows as model-written, and nothing
    // anywhere could tell you the prose was templated.
    //
    // Records the model ID rather than a generic "+model" suffix: this column is
    // the audit trail, ANALYSIS_MODEL has already changed once (Haiku 4.5 →
    // Sonnet 5), and "which model wrote this row" is exactly the question it
    // will be asked. Prefix-match on `quant-v3` to group by scoring version.
    const model =
      a.prose_source === "model" ? `${QUANT_VERSION}+${ANALYSIS_MODEL}` : QUANT_VERSION;
    if (a.prose_source === "model") modelRows++;
    const { error } = await admin.from("ai_analyses").upsert(
      {
        date: dateKey,
        ticker: g.ticker,
        listing_age_days: effectiveAgeDays(snapshot?.listing ?? null),
        short_thesis: a.short_thesis,
        catalyst: a.catalyst,
        catalyst_url: a.catalyst_url || null,
        catalyst_type: a.catalyst_type,
        short_score: a.short_score,
        percent_win_estimate: a.percent_win_estimate,
        expected_move_percent: a.expected_move_percent,
        features: snapshot ? (snapshot as unknown as Record<string, unknown>) : null,
        model,
        // Denormalized so the AI card renders exactly this drop's set, in order,
        // independent of how the live gainer list shifts before the close
        // (exchange: so its chart embed opens the right venue's symbol).
        //
        // price/change% ride along for the same reason: the landing panel needs
        // the drop's own figures. Reading them back off daily_gainers can't
        // work — the day cap above means the finalized board's new entrants
        // never get a thesis, so the join has holes, and a ticker that leaves
        // the board keeps whatever intraday snapshot it last had.
        rank: g.rank,
        company_name: g.companyName,
        exchange: g.exchange,
        price_at_score: g.price,
        change_percent_at_score: g.changePercent,
      },
      { onConflict: "date,ticker" },
    );
    if (error) {
      console.error(`[quant] store failed for ${g.ticker}:`, error.message);
    } else {
      created++;
      remaining--;
    }
  }

  // Model prose degrades per ticker: the call is caught inside generateThesisText and
  // the row is still written, with template prose. That is the right runtime
  // behaviour and a terrible silent failure — without this, a total Anthropic
  // outage produces a run that looks completely successful (five rows, no
  // errors) while /engine tells users a model wrote them. `ai_all_failed` never
  // fires here because it only triggers on ZERO rows.
  if (activeProseMode() === "model" && created > 0 && modelRows * 2 < created) {
    await maybeAlert(admin, {
      date: dateKey,
      type: "model_prose_degraded",
      subject: `Model prose degraded: ${modelRows}/${created} rows on ${dateKey}`,
      body:
        `AI_PROSE_MODE=model (${ANALYSIS_MODEL}), but only ${modelRows} of ${created} theses for ${dateKey} ` +
        `came back from the model. The rest fell back to the deterministic template ` +
        `and are stored as "${QUANT_VERSION}".\n\n` +
        `Users are unaffected — the template is the safe path — but /engine is ` +
        `currently claiming a model writes the prose.\n\n` +
        `Grep the logs for '"kind":"model_prose"' and for '[thesis] model prose' ` +
        `to see the per-ticker reason (timeout, budget spent, ungrounded figures, ` +
        `truncation, or an API error).`,
    });
  }
  return created;
}
