// The thesis engine's orchestrator. Historically this file WAS the Anthropic
// call (Haiku + web-search per ticker); it now drives the free in-house quant
// engine in lib/quant/ — EDGAR catalyst detection, base-rate/rule scoring,
// TradingView technicals, templated prose — and makes zero Anthropic calls
// itself. The only remaining Anthropic surface is the optional Haiku prose
// mode inside lib/quant/thesis.ts, still behind the AI_THESES_ENABLED spend
// switch. The AnalysisResult contract and ai_analyses writes are unchanged.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GainerRow } from "@/lib/marketdata/types";
import type { Database } from "@/lib/supabase/types";
import type { BaseRate } from "@/lib/baseRates";
import { detectCatalyst } from "./quant/edgar";
import { fetchTechnicals, type Technicals } from "./quant/technicals";
import { scoreShort } from "./quant/score";
import { activeProseMode, generateThesisText } from "./quant/thesis";

// The spend switch + model id live with the only code that can spend now.
export { aiThesesEnabled, ANALYSIS_MODEL } from "./quant/thesis";

// Versions the scoring rules in the stored `model` column so rows stay
// comparable when the Δ weights are re-tuned. Bump on scoring changes.
const QUANT_VERSION = "quant-v1";

// Catalyst classification — drives shortability (a buyout pins; a parabolic runner fades).
const CATALYST_TYPES = [
  "buyout",
  "earnings",
  "offering",
  "regulatory",
  "partnership",
  "meme_squeeze",
  "other",
] as const;

export interface AnalysisResult {
  short_thesis: string;
  catalyst: string;
  catalyst_url: string;
  catalyst_type: string;
  short_score: number;
  percent_win_estimate: number;
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
  return "other";
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
): Promise<AnalysisResult | null> {
  try {
    // detectCatalyst degrades to null on its own; a null just means "nothing
    // decisive on file" and the score falls back to price-action + base rate.
    const cat = await detectCatalyst(g.ticker, dateKey);
    const catalyst_type = normalizeCatalystType(cat?.catalyst_type ?? "other");
    const scored = scoreShort(g, streakCount, baseRate, catalyst_type, tech);
    const short_thesis = await generateThesisText({
      g,
      catalyst: cat?.catalyst ?? null,
      catalystType: catalyst_type,
      streakCount,
      baseRate,
      tech,
      shortScore: scored.short_score,
      percentWin: scored.percent_win_estimate,
    });
    return {
      catalyst:
        cat?.catalyst ??
        `No fresh SEC filing found for ${g.ticker} — the move looks driven by momentum, social buzz, or news outside official filings.`,
      catalyst_url: cat?.catalyst_url ?? "",
      catalyst_type,
      short_thesis,
      short_score: clampInt(scored.short_score, 1, 10, 5),
      percent_win_estimate: clampInt(scored.percent_win_estimate, 0, 100, 50),
    };
  } catch (err) {
    console.error(`[quant] analysis failed for ${g.ticker}:`, (err as Error).message);
    return null;
  }
}

/**
 * Generate + store theses for the top `count` gainers of a day, skipping any
 * that already exist. `streaks` maps ticker -> prior-day streak count;
 * `baseRates` maps ticker -> resolved empirical prior. Called from the
 * pre-close drop / EOD. Free to run (no Anthropic spend in the default
 * template mode), so it is NOT behind the AI_THESES_ENABLED switch.
 * Returns the number created.
 */
export async function generateAndStoreTopAnalyses(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
  streaks: Map<string, number>,
  baseRates: Map<string, BaseRate | null>,
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
  const techs = await fetchTechnicals(top.map((g) => g.ticker));

  // Self-describing rows: the scoring version, plus the prose source when the
  // paid Haiku mode is active (per-row template fallbacks aren't tracked).
  const model = activeProseMode() === "haiku" ? `${QUANT_VERSION}+haiku` : QUANT_VERSION;

  let created = 0;
  for (const g of top) {
    if (remaining <= 0) break; // never exceed the day cap
    if (have.has(g.ticker)) continue;
    const a = await generateAnalysis(
      g,
      dateKey,
      streaks.get(g.ticker) ?? null,
      baseRates.get(g.ticker) ?? null,
      techs.get(g.ticker) ?? null,
    );
    if (!a) continue;
    const { error } = await admin.from("ai_analyses").upsert(
      {
        date: dateKey,
        ticker: g.ticker,
        short_thesis: a.short_thesis,
        catalyst: a.catalyst,
        catalyst_url: a.catalyst_url || null,
        catalyst_type: a.catalyst_type,
        short_score: a.short_score,
        percent_win_estimate: a.percent_win_estimate,
        model,
        // Denormalized so the AI card renders exactly this drop's set, in order,
        // independent of how the live gainer list shifts before the close.
        rank: g.rank,
        company_name: g.companyName,
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
  return created;
}
