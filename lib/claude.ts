import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GainerRow } from "@/lib/marketdata/types";
import type { Database, RiskLevel } from "@/lib/supabase/types";

export const ANALYSIS_MODEL = "claude-sonnet-4-6";

export interface AnalysisResult {
  short_thesis: string;
  risk_level: RiskLevel;
  key_catalysts: string[];
  recommendation: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    short_thesis: {
      type: "string",
      description:
        "2-3 sentences on whether this runner is a credible short candidate and why.",
    },
    risk_level: {
      type: "string",
      enum: ["low", "medium", "high", "extreme"],
      description: "Risk of shorting this name (squeeze/volatility risk).",
    },
    key_catalysts: {
      type: "array",
      items: { type: "string" },
      description: "2-4 short bullet phrases on what likely drove the move.",
    },
    recommendation: {
      type: "string",
      description: "One-line educational call to action for a student.",
    },
  },
  required: ["short_thesis", "risk_level", "key_catalysts", "recommendation"],
  additionalProperties: false,
} as const;

// Coerce the model's risk_level to a valid enum value. Structured-output enums
// aren't perfectly strict (casing / "very high" / "moderate" slip through), and
// the DB has a check constraint, so normalize before insert.
function normalizeRisk(v: unknown): RiskLevel {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("extreme")) return "extreme";
  if (s.includes("high")) return "high";
  if (s.includes("medium") || s.includes("moderate")) return "medium";
  if (s.includes("low")) return "low";
  return "high"; // safe default for a parabolic runner
}

function buildPrompt(g: GainerRow): string {
  return [
    "You are a short-selling analyst helping DECA stock-market-game students evaluate the day's biggest gainers as potential SHORT candidates (they profit if the stock falls).",
    "This is educational, for a simulated competition — not financial advice.",
    "",
    "Today's mover:",
    `- Ticker: ${g.ticker}`,
    `- Company: ${g.companyName ?? "Unknown"}`,
    `- Price: ${g.price ?? "?"}`,
    `- Change: ${g.changePercent != null ? g.changePercent.toFixed(1) + "%" : "?"}`,
    `- Volume: ${g.volume ?? "?"}`,
    `- Relative volume: ${g.relativeVolume ?? "?"}`,
    `- Market cap: ${g.marketCap ?? "?"}`,
    `- Sector: ${g.sector ?? "?"}`,
    "",
    "Assess squeeze/volatility risk (low-float, parabolic moves are high/extreme risk to short). Be concise and concrete.",
  ].join("\n");
}

/** Generate a structured short thesis for one gainer. Returns null on failure. */
export async function generateAnalysis(
  g: GainerRow,
): Promise<AnalysisResult | null> {
  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: buildPrompt(g) }],
      // Structured outputs — guarantees schema-valid JSON in the text block.
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const parsed = JSON.parse(text.text) as AnalysisResult;
    return { ...parsed, risk_level: normalizeRisk(parsed.risk_level) };
  } catch (err) {
    console.error(`[claude] analysis failed for ${g.ticker}:`, (err as Error).message);
    return null;
  }
}

/**
 * Generate + store analyses for the top `count` gainers of a day, skipping any
 * that already exist. Called from the EOD cron. Returns the number created.
 */
export async function generateAndStoreTopAnalyses(
  admin: SupabaseClient<Database>,
  gainers: GainerRow[],
  dateKey: string,
  count = 6,
): Promise<number> {
  const top = gainers.slice(0, count);
  if (top.length === 0) return 0;

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
    if (have.has(g.ticker)) continue;
    const a = await generateAnalysis(g);
    if (!a) continue;
    const { error } = await admin.from("ai_analyses").upsert(
      {
        date: dateKey,
        ticker: g.ticker,
        short_thesis: a.short_thesis,
        risk_level: a.risk_level,
        key_catalysts: a.key_catalysts,
        recommendation: a.recommendation,
        model: ANALYSIS_MODEL,
      },
      { onConflict: "date,ticker" },
    );
    if (error) {
      console.error(`[claude] store failed for ${g.ticker}:`, error.message);
    } else {
      created++;
    }
  }
  return created;
}
