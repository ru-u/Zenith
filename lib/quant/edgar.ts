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
//
// Foreign private issuers file 6-K, not 8-K, and a 6-K carries no `items`, so
// every 6-K in the window is ambiguous and its press-release exhibit (EX-99) is
// what gets classified. This used to be 8-K only, which made a whole class of
// board names invisible: AIOK 2026-10-27 scored 7/10 as "no fresh SEC filing"
// with a $3.50 special dividend on a ~$14 stock sitting in a 6-K inside the
// window, and closed +109.7% the next session.

import { formatDateKey, isTradingDay } from "../market-calendar";
import { namesLikelySameCompany } from "./identity";

const CIK_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const REQUEST_TIMEOUT_MS = 8_000;
// The 8-K for a morning press release often files later that day or the next
// morning, so look back a few trading days rather than only at dateKey.
const LOOKBACK_TRADING_DAYS = 3;
// Cap document fetches per ticker — ambiguous 8-Ks only, newest first.
const MAX_DOC_FETCHES = 3;
const DOC_MATCH_CHARS = 40_000;

export type EdgarCatalystType =
  | "buyout"
  | "special_dividend"
  | "offering"
  | "earnings"
  | "regulatory";

export interface EdgarCatalyst {
  catalyst_type: EdgarCatalystType;
  catalyst: string; // one plain human sentence
  catalyst_url: string; // the filing's index page on sec.gov
}

/** A filing that was in the window but matched no catalyst class. */
export interface UnclassifiedFiling {
  form: string;
  filingDate: string;
  url: string;
}

export interface FilingsResult {
  catalyst: EdgarCatalyst | null;
  /** Newest first. Empty whenever `catalyst` is set, and when no CIK resolved. */
  unclassified: UnclassifiedFiling[];
}

// Highest wins when several filings land in the window: a buyout overrides
// everything (do-not-short); a special dividend is the other do-not-fade fact,
// and it outranks an offering's mild dilution prior — AIOK 2026-10-23 had both
// an F-3 shelf and the dividend 6-K in the window, and the dividend was the move.
const PRECEDENCE: EdgarCatalystType[] = [
  "buyout",
  "special_dividend",
  "offering",
  "earnings",
  "regulatory",
];

// Form-type signals that need no document fetch. `S-1(?![0-9])` keeps S-11
// (REIT registration) out while matching S-1, S-1/A, S-1MEF.
const OFFERING_FORM_RX = /^(S-[13]|F-[13])(?![0-9])|^424B/;
const BUYOUT_FORM_RX = /^(SC 14D9|SC TO-T|DEFM14A|425)/;

// Keyword classes for ambiguous 8-K / 6-K document text (checked in precedence order).
// "per share in cash" is also how a cash dividend is worded, so it only counts
// as deal language in a document that isn't a special-dividend announcement.
const BUYOUT_DEAL_TEXT_RX =
  /(agreement and plan of merger|to be acquired|tender offer|take[- ]private|merger agreement)/i;
const CASH_PER_SHARE_RX = /per share in cash/i;
const SPECIAL_DIVIDEND_TEXT_RX = /special (cash )?dividend/i;
// Nasdaq only imposes due bills when the distribution is >= 25% of the share
// price, so the phrase is itself proof the dividend is large enough to matter.
const DUE_BILLS_RX = /due bills?/i;
// "$3.50 per common share" — read from the text that follows the declaration.
const DIVIDEND_AMOUNT_RX = /\$\s?(\d+(?:\.\d+)?)\s*(?:per|a)\s+(?:common\s+|ordinary\s+)?share/i;
// Below this fraction of the current price a special dividend can't plausibly
// explain a board-sized spike, and capping the score on it would throw away a
// real short. A judgment, not a fitted value — there is no sample for this class.
const MIN_DIVIDEND_FRACTION = 0.1;
// 6-K only: an 8-K's earnings signal is item 2.02, which a 6-K doesn't carry.
// Deliberately narrow — D_EARNINGS is -9pp, so a false label is expensive. Past
// or present tense only: "will announce its financial results for the third
// quarter on Nov 5" is a date notice, the most common 6-K there is.
const EARNINGS_6K_TEXT_RX =
  /(\b(announce[sd]|report(s|ed))\s+(its\s+)?(unaudited\s+)?(financial|operating)( and (financial|operating))? results for the|unaudited (interim )?(condensed )?(consolidated )?financial statements (as of and )?for the)/i;
// "initial public offering" is history ("invested $600M at its July IPO" —
// BSP 2026-10-14), not a new raise.
const OFFERING_TEXT_RX =
  /((?<!initial )public offering|registered direct|private placement|securities purchase agreement|at-the-market offering|underwriting agreement)/i;
const REGULATORY_TEXT_RX =
  /(fda|510\(k\)|marketing clearance|marketing approval|top[- ]?line (data|results)|phase [123]\b|clinical trial|ce mark|emergency use authorization)/i;

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

interface CikEntry {
  cik: number;
  title: string; // registrant name per SEC — the identity cross-check anchor
}

let cikCache: { map: Map<string, CikEntry>; fetchedAt: number } | null = null;
const CIK_TTL_MS = 24 * 60 * 60 * 1000;

async function tickerToCik(ticker: string): Promise<CikEntry | null> {
  if (!cikCache || Date.now() - cikCache.fetchedAt > CIK_TTL_MS) {
    const res = await edgarFetch(CIK_MAP_URL);
    const json = (await res.json()) as Record<
      string,
      { cik_str: number; ticker: string; title?: string }
    >;
    const map = new Map<string, CikEntry>();
    for (const v of Object.values(json)) {
      map.set(v.ticker.toUpperCase(), { cik: v.cik_str, title: v.title ?? "" });
    }
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

function is6K(f: Filing): boolean {
  return f.form.startsWith("6-K");
}

// A 6-K's primary document is usually a one-paragraph cover sheet ("the
// Registrant issued a press release, attached as Exhibit 99.1"); the news is in
// the exhibit. Read up to two of those instead, from the filing's index.
const MAX_6K_EXHIBITS = 2;
// ...and only the LEAD of each. An EX-99 is as often a full legal agreement as
// a press release, and agreements carry deal boilerplate: SWVL 2026-09-10 filed
// a warrant whose fundamental-transaction clause says "tender offer", which
// read whole classed it a buyout and capped a 7/10 call (closed -10.4%) at 2.
// A press release states its news in the headline and first paragraphs.
const SIXK_LEAD_CHARS = 4_000;

async function exhibitDocs(cik: number, noDashes: string): Promise<string[]> {
  const res = await edgarFetch(
    `https://www.sec.gov/Archives/edgar/data/${cik}/${noDashes}/index.json`,
  );
  const json = (await res.json()) as { directory?: { item?: { name?: string }[] } };
  return (json.directory?.item ?? [])
    .map((i) => i.name ?? "")
    .filter((n) => /ex-?99/i.test(n) && /\.(htm|html|txt)$/i.test(n))
    .slice(0, MAX_6K_EXHIBITS);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch + strip a filing's classifiable text (or skip silently on any failure). */
async function fetchDocText(cik: number, f: Filing): Promise<string | null> {
  try {
    const noDashes = f.accessionNumber.replace(/-/g, "");
    let docs = f.primaryDocument ? [f.primaryDocument] : [];
    if (is6K(f)) {
      const exhibits = await exhibitDocs(cik, noDashes).catch(() => []);
      if (exhibits.length) docs = exhibits;
    }
    if (docs.length === 0) return null;
    const parts: string[] = [];
    for (const doc of docs) {
      const res = await edgarFetch(
        `https://www.sec.gov/Archives/edgar/data/${cik}/${noDashes}/${doc}`,
      );
      const text = stripHtml(await res.text());
      parts.push(is6K(f) ? text.slice(0, SIXK_LEAD_CHARS) : text);
    }
    return parts.join(" ").slice(0, DOC_MATCH_CHARS);
  } catch {
    return null;
  }
}

/**
 * The dividend per share, if the declaration states one. Searched from the first
 * "special dividend" mention onward so an unrelated figure earlier in the
 * release (a vessel price, a prior distribution) isn't picked up.
 */
function dividendAmount(text: string): number | null {
  const at = text.search(SPECIAL_DIVIDEND_TEXT_RX);
  if (at < 0) return null;
  const m = DIVIDEND_AMOUNT_RX.exec(text.slice(at, at + 400));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Whether a special-dividend announcement is big enough to be the move. Fails
 * toward claiming it when the size can't be checked: the class only ever caps a
 * score, so a wrong claim costs some upside, while a miss is AIOK.
 */
function isMaterialDividend(text: string, price: number | null): boolean {
  if (DUE_BILLS_RX.test(text)) return true;
  const amount = dividendAmount(text);
  if (amount == null || price == null || !(price > 0)) return true;
  return amount / price >= MIN_DIVIDEND_FRACTION;
}

// ── classification ──

function shortDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00-05:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Bare-number forms (Section 16's 3/4/5, Rule 144) read as "Form 4".
function formLabel(form: string): string {
  return /^\d+(\/A)?$/.test(form) ? `Form ${form}` : form;
}

// "an 8-K" / "an S-1" / "an SC 14D9" (letter-name leads) vs "a 424B5" /
// "a DEFM14A" / "a SCHEDULE 13D" / "a Form 4".
function withArticle(form: string): string {
  const label = formLabel(form);
  return `${/^(8|S-|SC |F-|X)/.test(label) ? "an" : "a"} ${label}`;
}

function describe(
  type: EdgarCatalystType,
  ticker: string,
  f: Filing,
  dividendPerShare: number | null,
): string {
  const when = `filed with the SEC ${shortDate(f.filingDate)}`;
  switch (type) {
    case "buyout":
      return `${ticker} looks like it's being acquired — ${withArticle(f.form)} ${when} points to a merger/buyout deal.`;
    case "special_dividend": {
      const amount = dividendPerShare != null ? ` of $${dividendPerShare.toFixed(2)} per share` : "";
      return `${ticker} declared a special dividend${amount} — ${withArticle(f.form)} ${when} — a one-time payout owed to whoever holds the shares on the record date.`;
    }
    case "offering":
      return `${ticker} is selling new shares — ${withArticle(f.form)} ${when} shows a dilutive stock offering / capital raise.`;
    case "earnings":
      return `${ticker} reported earnings results (${f.form} ${when}).`;
    case "regulatory":
      return `${ticker} disclosed regulatory or clinical-trial news in ${withArticle(f.form)} ${when}.`;
  }
}

/** "a SCHEDULE 13D/A and a Form 4 (Oct 27)" — distinct forms, newest first, ≤3 named. */
export function describeUnclassified(filings: UnclassifiedFiling[]): string | null {
  const seen = new Map<string, string>();
  for (const f of filings) if (!seen.has(f.form)) seen.set(f.form, f.filingDate);
  if (seen.size === 0) return null;
  const named = [...seen.entries()].slice(0, 3);
  // Group consecutive forms filed the same day under one date.
  const groups: { forms: string[]; date: string }[] = [];
  for (const [form, date] of named) {
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.forms.push(withArticle(form));
    else groups.push({ forms: [withArticle(form)], date });
  }
  const parts = groups.map(
    (g) => `${g.forms.join(" and ")} (${shortDate(g.date)})`,
  );
  const more = seen.size - named.length;
  if (more > 0) parts.push(`${more} other form type${more === 1 ? "" : "s"}`);
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Best-effort catalyst detection from SEC filings in the last few trading days,
 * plus whatever else was filed in that window and matched no class — so the
 * caller can say "it filed a Form 4 we don't classify" instead of the false "no
 * fresh SEC filing" (AIOK 2026-10-28: a CEO-purchase Form 4 and a 13D/A were in
 * the window and the thesis claimed no filing existed). Never throws.
 *
 * `companyName` (the scanner's name for the ticker) guards against ticker
 * collisions: SEC's map can lag a listing-day symbol change or still hold a
 * prior owner of the symbol, and pulling that CIK's filings would attribute a
 * different company's catalysts to this gainer. On a name mismatch we skip —
 * missing catalyst beats wrong-company catalyst.
 *
 * `price` sizes a special dividend against the stock (see isMaterialDividend);
 * null skips that check.
 */
export async function detectFilings(
  ticker: string,
  dateKey: string,
  companyName: string | null = null,
  price: number | null = null,
): Promise<FilingsResult> {
  const none: FilingsResult = { catalyst: null, unclassified: [] };
  try {
    const entry = await tickerToCik(ticker);
    if (entry == null) return none;
    if (!namesLikelySameCompany(companyName, entry.title)) {
      console.warn(
        `[edgar] identity mismatch for ${ticker}: scanner says "${companyName}", ` +
          `SEC map says "${entry.title}" (CIK ${entry.cik}) — skipping filings lookup`,
      );
      return none;
    }
    const cik = entry.cik;

    const startKey = lookbackStartKey(dateKey, LOOKBACK_TRADING_DAYS);
    const filings = await fetchWindowFilings(cik, startKey, dateKey);
    if (filings.length === 0) return none;

    // Pass 1 — free, form/items-only signals. Newest filing wins within a class.
    const found = new Map<EdgarCatalystType, Filing>();
    const claim = (type: EdgarCatalystType, f: Filing) => {
      if (!found.has(type)) found.set(type, f);
    };
    let dividendPerShare: number | null = null;
    const ambiguous: Filing[] = [];
    for (const f of filings) {
      if (BUYOUT_FORM_RX.test(f.form)) claim("buyout", f);
      else if (OFFERING_FORM_RX.test(f.form)) claim("offering", f);
      else if (f.form.startsWith("8-K")) {
        if (hasItem(f, "2.02")) claim("earnings", f);
        // Deal/raise/news 8-Ks need the document text to tell apart.
        if (hasItem(f, "1.01", "2.01", "3.02", "7.01", "8.01")) ambiguous.push(f);
      } else if (is6K(f)) {
        // No items on a 6-K — the text is the only signal.
        ambiguous.push(f);
      }
    }

    // Pass 2 — keyword-classify ambiguous 8-K / 6-K text, unless a buyout form
    // (the highest-precedence class) already settled it.
    if (!found.has("buyout")) {
      for (const f of ambiguous.slice(0, MAX_DOC_FETCHES)) {
        const text = await fetchDocText(cik, f);
        if (!text) continue;
        const dividend = SPECIAL_DIVIDEND_TEXT_RX.test(text);
        if (BUYOUT_DEAL_TEXT_RX.test(text) || (CASH_PER_SHARE_RX.test(text) && !dividend)) {
          claim("buyout", f);
        } else if (dividend && isMaterialDividend(text, price)) {
          if (!found.has("special_dividend")) dividendPerShare = dividendAmount(text);
          claim("special_dividend", f);
        } else if (OFFERING_TEXT_RX.test(text)) claim("offering", f);
        else if (is6K(f) && EARNINGS_6K_TEXT_RX.test(text)) claim("earnings", f);
        else if ((is6K(f) || hasItem(f, "7.01", "8.01")) && REGULATORY_TEXT_RX.test(text))
          claim("regulatory", f);
        if (found.has("buyout")) break;
      }
    }

    for (const type of PRECEDENCE) {
      const f = found.get(type);
      if (f) {
        return {
          catalyst: {
            catalyst_type: type,
            catalyst: describe(type, ticker, f, dividendPerShare),
            catalyst_url: filingIndexUrl(cik, f),
          },
          unclassified: [],
        };
      }
    }
    return {
      catalyst: null,
      unclassified: filings.map((f) => ({
        form: f.form,
        filingDate: f.filingDate,
        url: filingIndexUrl(cik, f),
      })),
    };
  } catch (err) {
    console.warn(`[edgar] catalyst detection failed for ${ticker}:`, (err as Error).message);
    return none;
  }
}

/** The catalyst alone — the shape scripts/backfill-catalysts.mjs consumes. */
export async function detectCatalyst(
  ticker: string,
  dateKey: string,
  companyName: string | null = null,
  price: number | null = null,
): Promise<EdgarCatalyst | null> {
  return (await detectFilings(ticker, dateKey, companyName, price)).catalyst;
}
