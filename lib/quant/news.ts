// Headline-based catalyst fallback — attacks the biggest catalyst blind spot:
// deals and news announced by press release don't hit EDGAR until the 8-K is
// filed (often the next day), so ~2/3 of scored rows land as "other". When
// EDGAR finds nothing, this classifies recent Finnhub company-news headlines
// into the SAME taxonomy (buyout/offering/earnings/regulatory), so the existing
// score Δs, caps, and BEHAVIOR prose apply unchanged. EDGAR stays authoritative
// — this only runs when filings said nothing.
//
// Free-tier dependency (like TradingView): revisit at commercial scale. No
// FINNHUB_API_KEY in the environment = silently skipped, same fail-safe
// posture as everything else in lib/quant/.

import type { EdgarCatalyst, EdgarCatalystType } from "./edgar";
import { withRetry } from "../retry";
import { tradingDaysAgoKey } from "../market-calendar";

const REQUEST_TIMEOUT_MS = 8_000;

// Headline keyword classes, checked in EDGAR's precedence order (buyout
// overrides everything, offering overrides earnings/regulatory). Conservative
// on purpose — a false "buyout" would wrongly cap the score to 2, so the
// buyout patterns demand deal language, not just the word "acquire".
const HEADLINE_RX: Record<EdgarCatalystType, RegExp> = {
  buyout:
    /(buyout|takeover|to be acquired|being acquired|agrees? to (be )?acquir|acquisition (of|by)|merger agreement|definitive (merger )?agreement|per[- ]share.{0,12}cash|tender offer|take[- ]private)/i,
  offering:
    /(public offering|private placement|registered direct|at[- ]the[- ]market offering|securities purchase agreement|prices? .{0,24}offering|capital raise)/i,
  earnings:
    /(earnings|quarterly results|fiscal .{0,12}results|revenue (beat|jump|surge|soar)|(beats?|tops?|misses?) (estimates|expectations)|raises? .{0,12}guidance)/i,
  regulatory:
    /(fda (approval|clearance)|510\(k\)|phase [123]\b|clinical (trial|data|results)|topline (data|results)|breakthrough (therapy|device) designation|ce mark|emergency use authorization)/i,
};
const PRECEDENCE: EdgarCatalystType[] = ["buyout", "offering", "earnings", "regulatory"];

function describe(type: EdgarCatalystType, ticker: string, headline: string): string {
  const quoted = `("${headline.length > 100 ? `${headline.slice(0, 97)}…` : headline}")`;
  switch (type) {
    case "buyout":
      return `${ticker} looks like it's being acquired — press coverage points to a merger/buyout deal ${quoted}.`;
    case "offering":
      return `${ticker} is selling new shares — press coverage points to a dilutive offering / capital raise ${quoted}.`;
    case "earnings":
      return `${ticker} is moving on earnings news ${quoted}.`;
    case "regulatory":
      return `${ticker} is moving on regulatory or clinical-trial news ${quoted}.`;
  }
}

interface FinnhubArticle {
  datetime?: number;
  headline?: string;
  url?: string;
}

// Finnhub tags market-roundup articles ("X Posts Upbeat Earnings, Joins Y, Z
// And Other Big Stocks…") to EVERY mentioned ticker — classifying those would
// pin someone else's news on this stock. Only classify headlines that name the
// ticker or a distinctive token of the company name.
function mentionsCompany(headline: string, ticker: string, companyName: string | null): boolean {
  if (new RegExp(`\\b${ticker}\\b`).test(headline)) return true;
  if (companyName) {
    const token = companyName
      .split(/[\s,.]+/)
      .map((t) => t.replace(/[^a-z0-9]/gi, "").toLowerCase())
      .find((t) => t.length >= 3);
    if (token && headline.toLowerCase().includes(token)) return true;
  }
  return false;
}

async function fetchNews(ticker: string, from: string, to: string, key: string): Promise<FinnhubArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const u = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(u, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`finnhub returned ${res.status}`);
    const json = (await res.json()) as unknown;
    return Array.isArray(json) ? (json as FinnhubArticle[]) : [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Classify the spike from recent press headlines (prior trading day → today).
 * Same return shape as EDGAR's detectCatalyst; null when the key is absent,
 * nothing classifies, or the fetch fails — the caller falls back to "other".
 */
export async function detectNewsCatalyst(
  ticker: string,
  dateKey: string,
  companyName: string | null = null,
): Promise<EdgarCatalyst | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const [y, m, d] = dateKey.split("-").map(Number);
  const from = tradingDaysAgoKey(2, new Date(Date.UTC(y, m - 1, d, 12)));

  try {
    const articles = await withRetry(() => fetchNews(ticker, from, dateKey, key), {
      onRetry: (err, attempt, delay) =>
        console.warn(
          `[news] retry ${attempt} in ${Math.round(delay)}ms:`,
          (err as Error)?.message,
        ),
    });

    // Newest headline wins within a class; precedence picks across classes.
    const found = new Map<EdgarCatalystType, FinnhubArticle>();
    const sorted = [...articles].sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));
    for (const a of sorted) {
      const h = a.headline;
      if (!h || !mentionsCompany(h, ticker, companyName)) continue;
      for (const type of PRECEDENCE) {
        if (!found.has(type) && HEADLINE_RX[type].test(h)) found.set(type, a);
      }
      if (found.has("buyout")) break;
    }
    for (const type of PRECEDENCE) {
      const hit = found.get(type);
      if (hit?.headline) {
        return {
          catalyst_type: type,
          catalyst: describe(type, ticker, hit.headline),
          catalyst_url: hit.url ?? "",
        };
      }
    }
  } catch (err) {
    console.warn(`[news] ${ticker} lookup failed — falling back to "other":`, (err as Error).message);
  }
  return null;
}
