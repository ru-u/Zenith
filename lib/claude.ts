import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GainerRow } from "@/lib/marketdata/types";
import type { Database } from "@/lib/supabase/types";

export const ANALYSIS_MODEL = "claude-haiku-4-5";

/**
 * Kill switch for ALL Anthropic calls. Generation runs ONLY when
 * `AI_THESES_ENABLED=true` — off by default, so a fresh environment, an
 * exhausted credit balance, or a research pause can never spend. Everything
 * downstream degrades gracefully: the pre-close email still lists the top
 * movers (just without theses), and reads/UI keep serving whatever theses
 * are already stored. Flip it in .env.local / the deploy env when the AI
 * analysis direction is settled.
 */
export function aiThesesEnabled(): boolean {
  return process.env.AI_THESES_ENABLED === "true";
}

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

const SCHEMA = {
  type: "object",
  properties: {
    catalyst: {
      type: "string",
      description:
        "One plain sentence on why the stock spiked TODAY, grounded in web search (e.g. 'jumped after a $12/share buyout offer from Acme Corp').",
    },
    catalyst_url: {
      type: "string",
      description:
        "URL of the source you used for the catalyst. Empty string if you couldn't find one.",
    },
    catalyst_type: {
      type: "string",
      enum: [...CATALYST_TYPES],
      description:
        "Classify the catalyst. 'buyout' = M&A/acquisition/take-private (pins near deal price); 'offering' = dilutive raise; 'meme_squeeze' = social/short-squeeze driven.",
    },
    short_thesis: {
      type: "string",
      description:
        "2-3 sentences: is this a credible NEXT-DAY short and why, grounded in how THIS catalyst type behaves over a single next-day hold — not just the size of the move.",
    },
    short_score: {
      type: "integer",
      description:
        "How attractive as a NEXT-DAY short on a 1-10 scale (10 = best). A pinned buyout should score very low even after a huge % move.",
    },
    percent_win_estimate: {
      type: "integer",
      description:
        "Your estimated % chance (0-100) it closes LOWER at the very next end-of-day vs today's close. START from the historical base rate provided in the prompt (if any) and adjust up or down for the specific catalyst and price action — don't ignore it.",
    },
  },
  required: [
    "catalyst",
    "catalyst_url",
    "catalyst_type",
    "short_thesis",
    "short_score",
    "percent_win_estimate",
  ],
  additionalProperties: false,
} as const;

// Structured-output enums aren't perfectly strict, so coerce to a known type.
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

// Round + clamp a model-supplied number into [lo, hi]; fall back on garbage.
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function buildPrompt(
  g: GainerRow,
  streakCount: number | null,
  basePrior: string | null,
): string {
  const streakLine =
    streakCount != null && streakCount > 1
      ? `- Streak: has closed as a top gainer ${streakCount} days running. Treat this as NEUTRAL context — a streak can mean exhaustion (due to fade) OR genuine strength (keeps running). Decide for yourself; don't assume a direction.`
      : "- Streak: first day on the leaderboard (no prior-day streak).";

  const priorBlock = basePrior
    ? [
        "",
        "EMPIRICAL BASE RATE (calibrate your percent_win_estimate to this — it's the realized frequency from ~1 year of similar setups, BEFORE accounting for the specific catalyst):",
        `- ${basePrior}`,
        "- Start here, then adjust: a fade-prone catalyst pushes the win chance above the base rate; a buyout/strong-news catalyst pushes it below.",
      ]
    : [];

  return [
    "You are the sharpest next-day short-selling analyst alive, helping DECA Stock Market Game students (high-schoolers new to investing) evaluate today's biggest gainers as SHORT candidates — they profit if the stock falls.",
    "This is educational, for a simulated competition — not financial advice.",
    "",
    "HOW THE GAME WORKS (critical):",
    "- A student can ONLY enter and exit at the 4:00 PM ET close. They short at TODAY's close.",
    "- You are judging ONE thing: the probability the stock closes LOWER at the very NEXT end-of-day (one trading day later) vs today's close.",
    "- They are NOT watching a monitor and cannot react intraday. There are no stops. It is a single overnight-to-next-close decision.",
    "",
    "HOW DIFFERENT CATALYSTS BEHAVE AFTER A SPIKE (this drives your call, NOT the size of the move):",
    "- Buyout / M&A / acquisition: the stock gets PINNED near the announced deal price. Forward volatility collapses to ~zero — it will NOT meaningfully drop the next day. A BAD short despite a huge % move.",
    "- Dilutive offering / capital raise: often FADES after the pop.",
    "- Exhausted low-float parabolic runner on stale or no fresh news: more likely to mean-revert / fade.",
    "- Genuine earnings beat or real positive news: can keep running — a riskier short.",
    "- Meme / short-squeeze: high variance and dangerous to short.",
    "First find WHY it spiked today, classify the catalyst, THEN reason about how that type typically behaves over a single next-day hold.",
    "",
    "Today's mover:",
    `- Ticker: ${g.ticker}`,
    `- Company: ${g.companyName ?? "Unknown"}`,
    `- Price: ${g.price ?? "?"}`,
    `- Change today: ${g.changePercent != null ? g.changePercent.toFixed(1) + "%" : "?"}`,
    `- Volume: ${g.volume ?? "?"}`,
    `- Relative volume: ${g.relativeVolume ?? "?"}`,
    `- Market cap: ${g.marketCap ?? "?"}`,
    `- Sector: ${g.sector ?? "?"}`,
    streakLine,
    ...priorBlock,
    "",
    "Use web search to find the specific catalyst behind today's move and a source URL. Then return your structured assessment.",
    "Write for a 16-year-old new to markets: plain language, no jargon.",
  ].join("\n");
}

/** Drive a (possibly multi-step) web-search turn to completion. */
async function createWithSearch(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages">,
  prompt: string,
): Promise<Anthropic.Message> {
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let res = await client.messages.create({ ...params, messages });
  // Server-tool loops can hit the iteration cap and pause; re-send to resume.
  for (let i = 0; res.stop_reason === "pause_turn" && i < 3; i++) {
    messages = [...messages, { role: "assistant", content: res.content }];
    res = await client.messages.create({ ...params, messages });
  }
  return res;
}

/** Generate a structured next-day short thesis for one gainer. Null on failure. */
export async function generateAnalysis(
  g: GainerRow,
  streakCount: number | null,
  basePrior: string | null,
): Promise<AnalysisResult | null> {
  // Belt-and-braces: the batch entry below gates too, but no future caller
  // should be able to reach the API while the switch is off.
  if (!aiThesesEnabled()) return null;
  const client = new Anthropic();
  try {
    const res = await createWithSearch(
      client,
      {
        model: ANALYSIS_MODEL,
        max_tokens: 3000,
        // Web search — the catalyst can't come from the scanner or training data.
        // Basic variant (no dynamic code-exec filtering loop) — far cheaper per call.
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        // Structured outputs — the FINAL text block is schema-valid JSON.
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      } as Omit<Anthropic.MessageCreateParamsNonStreaming, "messages">,
      buildPrompt(g, streakCount, basePrior),
    );

    // With a server tool the response interleaves search blocks; the structured
    // JSON is the LAST text block.
    const texts = res.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    const last = texts[texts.length - 1];
    if (!last) return null;
    const parsed = JSON.parse(last.text) as AnalysisResult;
    return {
      ...parsed,
      catalyst_type: normalizeCatalystType(parsed.catalyst_type),
      short_score: clampInt(parsed.short_score, 1, 10, 5),
      percent_win_estimate: clampInt(parsed.percent_win_estimate, 0, 100, 50),
    };
  } catch (err) {
    console.error(`[claude] analysis failed for ${g.ticker}:`, (err as Error).message);
    return null;
  }
}

/**
 * Generate + store theses for the top `count` gainers of a day, skipping any that
 * already exist. `streaks` maps ticker -> prior-day streak count (neutral context
 * for the model). Called from the pre-close drop / EOD. Returns the number created.
 */
export async function generateAndStoreTopAnalyses(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
  streaks: Map<string, number>,
  priors: Map<string, string | null>,
  count = 5,
): Promise<number> {
  if (!aiThesesEnabled()) {
    console.log(
      `[claude] AI theses DISABLED — skipped generation for ${dateKey}. Set AI_THESES_ENABLED=true to re-enable.`,
    );
    return 0;
  }
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

  let created = 0;
  for (const g of top) {
    if (remaining <= 0) break; // never exceed the day cap
    if (have.has(g.ticker)) continue;
    const a = await generateAnalysis(
      g,
      streaks.get(g.ticker) ?? null,
      priors.get(g.ticker) ?? null,
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
        model: ANALYSIS_MODEL,
        // Denormalized so the AI card renders exactly this drop's set, in order,
        // independent of how the live gainer list shifts before the close.
        rank: g.rank,
        company_name: g.companyName,
      },
      { onConflict: "date,ticker" },
    );
    if (error) {
      console.error(`[claude] store failed for ${g.ticker}:`, error.message);
    } else {
      created++;
      remaining--;
    }
  }
  return created;
}
