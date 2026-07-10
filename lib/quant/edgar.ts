// SEC EDGAR catalyst discovery — free, keyless, and authoritative for the two
// most decision-relevant catalyst classes for a short screener: offerings
// (dilution → fade-prone) and buyouts (pinned near deal price → bad short).
// Coverage gap accepted for v1: catalysts that never hit a filing (analyst
// upgrades, sympathy moves, social momentum) return null and the engine falls
// back to price-action + base-rate scoring.
//
// Flow: ticker → CIK via the company_tickers.json map (cached in-process),
// then recent filings via data.sec.gov/submissions. 8-K `items` come populated
// in that JSON (e.g. "2.02,9.01"), so only ambiguous 8-Ks need a document
// fetch for keyword classification. SEC asks for a descriptive User-Agent
// (SEC_EDGAR_USER_AGENT) and caps at ~10 req/s — we do ~a dozen a day.

import { formatDateKey, isTradingDay } from "../market-calendar";

const CIK_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const REQUEST_TIMEOUT_MS = 8_000;
// The 8-K for a morning press release often files later that day or the next
// morning, so look back a few trading days rather than only at dateKey.
const LOOKBACK_TRADING_DAYS = 3;
// Cap document fetches per ticker — ambiguous 8-Ks only, newest first.
const MAX_DOC_FETCHES = 3;
const DOC_MATCH_CHARS = 40_000;

export type EdgarCatalystType = "buyout" | "offering" | "earnings" | "regulatory";

export interface EdgarCatalyst {
  catalyst_type: EdgarCatalystType;
  catalyst: string; // one plain human sentence
  catalyst_url: string; // the filing's index page on sec.gov
}

// Highest wins when several filings land in the window: a buyout overrides
// everything (do-not-short), an offering overrides earnings/regulatory.
const PRECEDENCE: EdgarCatalystType[] = ["buyout", "offering", "earnings", "regulatory"];

// Form-type signals that need no document fetch. `S-1(?![0-9])` keeps S-11
// (REIT registration) out while matching S-1, S-1/A, S-1MEF.
const OFFERING_FORM_RX = /^(S-[13]|F-[13])(?![0-9])|^424B/;
const BUYOUT_FORM_RX = /^(SC 14D9|SC TO-T|DEFM14A|425)/;

// Keyword classes for ambiguous 8-K document text (checked in precedence order).
const BUYOUT_TEXT_RX =
  /(agreement and plan of merger|to be acquired|per share in cash|tender offer|take[- ]private|merger agreement)/i;
const OFFERING_TEXT_RX =
  /(public offering|registered direct|private placement|securities purchase agreement|at-the-market offering|underwriting agreement)/i;
const REGULATORY_TEXT_RX =
  /(fda|510\(k\)|marketing clearance|marketing approval|topline (data|results)|phase [123]\b|clinical trial|ce mark|emergency use authorization)/i;

interface Filing {
  form: string;
  filingDate: string; // YYYY-MM-DD
  items: string; // "1.01,9.01" — 8-K only, empty otherwise
  accessionNumber: string; // "0001234567-26-000123"
  primaryDocument: string;
}

function edgarUserAgent(): string {
  // SEC requires a descriptive UA with contact info; set SEC_EDGAR_USER_AGENT.
  return process.env.SEC_EDGAR_USER_AGENT ?? "Zenith Screener (dev, unconfigured contact)";
}

async function edgarFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": edgarUserAgent() },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// ── ticker → CIK, cached in-process (Railway runs a single replica) ──

let cikCache: { map: Map<string, number>; fetchedAt: number } | null = null;
const CIK_TTL_MS = 24 * 60 * 60 * 1000;

async function tickerToCik(ticker: string): Promise<number | null> {
  if (!cikCache || Date.now() - cikCache.fetchedAt > CIK_TTL_MS) {
    const res = await edgarFetch(CIK_MAP_URL);
    const json = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    const map = new Map<string, number>();
    for (const v of Object.values(json)) map.set(v.ticker.toUpperCase(), v.cik_str);
    cikCache = { map, fetchedAt: Date.now() };
  }
  const t = ticker.toUpperCase();
  // company_tickers.json uses "-" for share classes (BRK-B), providers use ".".
  return cikCache.map.get(t) ?? cikCache.map.get(t.replace(/\./g, "-")) ?? null;
}

// ── date window ──

/** First date key of the lookback window: `tradingDays` trading days before dateKey. */
function lookbackStartKey(dateKey: string, tradingDays: number): string {
  // Noon at a fixed ET-ish offset keeps the calendar date stable across DST.
  let d = new Date(`${dateKey}T12:00:00-05:00`);
  let remaining = tradingDays;
  while (remaining > 0) {
    d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    if (isTradingDay(d)) remaining--;
  }
  return formatDateKey(d);
}

// ── filings ──

async function fetchWindowFilings(
  cik: number,
  startKey: string,
  endKey: string,
): Promise<Filing[]> {
  const padded = String(cik).padStart(10, "0");
  const res = await edgarFetch(`https://data.sec.gov/submissions/CIK${padded}.json`);
  const json = (await res.json()) as {
    filings?: {
      recent?: {
        form?: string[];
        filingDate?: string[];
        items?: string[];
        accessionNumber?: string[];
        primaryDocument?: string[];
      };
    };
  };
  const r = json.filings?.recent;
  if (!r?.form || !r.filingDate || !r.accessionNumber) return [];

  const out: Filing[] = [];
  // Arrays are parallel and newest-first; the window is tiny, so scanning the
  // whole recent block (~1000 rows) is fine.
  for (let i = 0; i < r.form.length; i++) {
    const date = r.filingDate[i];
    if (!date || date < startKey || date > endKey) continue;
    out.push({
      form: r.form[i] ?? "",
      filingDate: date,
      items: r.items?.[i] ?? "",
      accessionNumber: r.accessionNumber[i] ?? "",
      primaryDocument: r.primaryDocument?.[i] ?? "",
    });
  }
  return out; // stays newest-first
}

function filingIndexUrl(cik: number, f: Filing): string {
  const noDashes = f.accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${noDashes}/${f.accessionNumber}-index.htm`;
}

function hasItem(f: Filing, ...items: string[]): boolean {
  const set = f.items.split(",").map((s) => s.trim());
  return items.some((i) => set.includes(i));
}

/** Fetch + strip an 8-K primary document (or skip silently on any failure). */
async function fetchDocText(cik: number, f: Filing): Promise<string | null> {
  if (!f.primaryDocument) return null;
  try {
    const noDashes = f.accessionNumber.replace(/-/g, "");
    const res = await edgarFetch(
      `https://www.sec.gov/Archives/edgar/data/${cik}/${noDashes}/${f.primaryDocument}`,
    );
    const html = await res.text();
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, DOC_MATCH_CHARS);
  } catch {
    return null;
  }
}

// ── classification ──

function shortDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00-05:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// "an 8-K" / "an S-1" (vowel-sounding leads) vs "a 424B5" / "a DEFM14A".
function withArticle(form: string): string {
  return `${/^[8SFX]/.test(form) ? "an" : "a"} ${form}`;
}

function describe(type: EdgarCatalystType, ticker: string, f: Filing): string {
  const when = `filed with the SEC ${shortDate(f.filingDate)}`;
  switch (type) {
    case "buyout":
      return `${ticker} looks like it's being acquired — ${withArticle(f.form)} ${when} points to a merger/buyout deal.`;
    case "offering":
      return `${ticker} is selling new shares — ${withArticle(f.form)} ${when} shows a dilutive stock offering / capital raise.`;
    case "earnings":
      return `${ticker} reported earnings results (8-K ${when}).`;
    case "regulatory":
      return `${ticker} disclosed regulatory or clinical-trial news in an 8-K ${when}.`;
  }
}

/**
 * Best-effort catalyst detection from SEC filings in the last few trading days.
 * Returns null when nothing decisive is on file — never throws.
 */
export async function detectCatalyst(
  ticker: string,
  dateKey: string,
): Promise<EdgarCatalyst | null> {
  try {
    const cik = await tickerToCik(ticker);
    if (cik == null) return null;

    const startKey = lookbackStartKey(dateKey, LOOKBACK_TRADING_DAYS);
    const filings = await fetchWindowFilings(cik, startKey, dateKey);
    if (filings.length === 0) return null;

    // Pass 1 — free, form/items-only signals. Newest filing wins within a class.
    const found = new Map<EdgarCatalystType, Filing>();
    const claim = (type: EdgarCatalystType, f: Filing) => {
      if (!found.has(type)) found.set(type, f);
    };
    const ambiguous: Filing[] = [];
    for (const f of filings) {
      if (BUYOUT_FORM_RX.test(f.form)) claim("buyout", f);
      else if (OFFERING_FORM_RX.test(f.form)) claim("offering", f);
      else if (f.form.startsWith("8-K")) {
        if (hasItem(f, "2.02")) claim("earnings", f);
        // Deal/raise/news 8-Ks need the document text to tell apart.
        if (hasItem(f, "1.01", "2.01", "3.02", "7.01", "8.01")) ambiguous.push(f);
      }
    }

    // Pass 2 — keyword-classify ambiguous 8-K text, unless a buyout form
    // (the highest-precedence class) already settled it.
    if (!found.has("buyout")) {
      for (const f of ambiguous.slice(0, MAX_DOC_FETCHES)) {
        const text = await fetchDocText(cik, f);
        if (!text) continue;
        if (BUYOUT_TEXT_RX.test(text)) claim("buyout", f);
        else if (OFFERING_TEXT_RX.test(text)) claim("offering", f);
        else if (hasItem(f, "7.01", "8.01") && REGULATORY_TEXT_RX.test(text))
          claim("regulatory", f);
        if (found.has("buyout")) break;
      }
    }

    for (const type of PRECEDENCE) {
      const f = found.get(type);
      if (f) {
        return {
          catalyst_type: type,
          catalyst: describe(type, ticker, f),
          catalyst_url: filingIndexUrl(cik, f),
        };
      }
    }
    return null;
  } catch (err) {
    console.warn(`[edgar] catalyst detection failed for ${ticker}:`, (err as Error).message);
    return null;
  }
}
