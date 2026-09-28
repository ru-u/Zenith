// Arbitrary-ticker probe for the quant engine — RESEARCH ONLY.
//
//   node --env-file=.env.local scripts/probe.mjs SOFI
//   node --env-file=.env.local scripts/probe.mjs SPY ARKK NVDA --no-store
//
// The engine (lib/quant/ + lib/claude.ts) only ever scores the day's top-5
// gainers. This runs the SAME code — generateAnalysis(), verbatim, compiled from
// the real source — against any US-listed symbol, for personal research and for
// testing strategies for future competitions.
//
// ── ZERO-TOUCH CONTRACT ──────────────────────────────────────────────────────
// This script must have no effect on any aspect of Zenith. The guarantees are
// structural, not promises:
//
//   * It NEVER holds a service-role credential — SUPABASE_SERVICE_ROLE_KEY is
//     deleted from the environment below, and the client is built from the anon
//     key, for which insert/update/delete are revoked across the whole public
//     schema (supabase/schema.sql:392-396). Writing to production is impossible
//     by construction.
//   * It is .mjs on purpose. tsconfig.json includes **/*.ts, **/*.tsx and
//     **/*.mts and excludes only node_modules, so a new .ts anywhere in this
//     repo is type-checked by `npm run build` and could break a deploy. This
//     file is invisible to it.
//   * It cannot spend Anthropic money: ANTHROPIC_API_KEY and AI_THESES_ENABLED
//     are deleted and AI_PROSE_MODE is forced to "template". .env.local really
//     does carry AI_THESES_ENABLED=true and AI_PROSE_MODE=model, so this is
//     load-bearing rather than defensive.
//   * It never calls generateAndStoreTopAnalyses() — the wrapper holding the
//     ai_analyses upsert (lib/claude.ts:299), the maybeAlert (:345) and the
//     five-rows-per-day cap (:221). generateAnalysis() itself takes no Supabase
//     client, performs no writes and raises no alerts.
//   * Results go to a local JSONL file, never to a table. Putting probe rows in
//     ai_analyses would break the day cap (suppressing the real 3:30 drop), the
//     read-path drop trigger (app/api/gainers/route.ts:219), the ai_all_failed
//     alert (app/api/cron/run-eod/route.ts:121), the outcome recorders,
//     fetchPriorCalls (lib/quant/features.ts:375), calibration, backtest, and
//     the Pro /analysis page — all at once. Do not "just add a flag column".
//   * The temp build lives OUTSIDE the working tree. Nothing is ever created
//     inside the repo, not even a gitignored folder.
//
// ── THE HONESTY PROBLEM, AND THE MECHANISM THAT SOLVES IT ────────────────────
// gainer_base_rates was fit on historical_gainers (n=1,919), a table with no
// change_percent column at all: its universe is "appeared in a top-gainer
// scrape", not a threshold. Meanwhile resolveBaseRate() ALWAYS returns
// something, falling through to the global ALL|ALL|ALL bucket. Point the engine
// at a flat mega-cap and it will quote a ~61% "closed lower next session" prior
// mined from parabolic nano-caps, in prose, as if it applied.
//
// So: when a ticker is outside the fitted universe we pass baseRate = null. That
// one value does everything, with no change to any engine file — scoreShort()
// falls to FALLBACK_WIN = 50 (lib/quant/score.ts:84), expectedMovePercent() and
// formatBaseRatePrior() both return null (lib/baseRates.ts:140,147), so the
// "...gainers" / "all historical top-gainers" scope string can never be emitted.
// The gainer prior cannot leak; it is structurally unreachable.
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Locks. These run after the static imports are evaluated (ESM hoists them),
// which is safe because none of those modules read these variables — and the
// engine itself is loaded dynamically, further down, long after this point.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_THESES_ENABLED;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.AI_PROSE_MODE = "template";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME_DIR = join(homedir(), ".zenith-probe");
const BASE_RATES_PATH = join(HOME_DIR, "base-rates.json");
const DEFAULT_OUT = join(HOME_DIR, "probe-log.jsonl");
const MAX_TICKERS = 25;
const BAR = "─".repeat(78);

// ── the universe test ───────────────────────────────────────────────────────
//
// in_universe ⟺ common stock ∧ NASDAQ/NYSE ∧ (on today's board ∨ move ≥ 5.0%)
//
// Board membership is checked first and is DECISIVE, because it is literally the
// admission process gainer_base_rates was fit on.
//
// 5.0 is a JUDGEMENT CALL and should be read as one. There is no threshold to
// recover from the fit: historical_gainers never recorded change%. The only
// empirical anchor is the live board's own floor (daily_gainers, n=6,477):
// min +3.44%, p1 +4.05%, p5 +5.03%, p25 +6.99%, median +9.22%. This is that p5,
// rounded — deliberately round, because the data cannot support two decimals of
// precision about somebody else's scraper.
//
// It sits at p5 rather than at the observed minimum because the error is
// asymmetric: a false IN-universe quotes an edge the ticker never earned, in
// front of a real decision; a false OFF-universe merely prints "50%, coin flip".
// Only the first can lose money.
//
// Deliberately NOT in the test, measured against the fit itself (n=1,919):
//   * no relvol floor  — 18.1% of the fitting set had relvol < 2 (p5 = 0.55)
//   * no range floor   — 4.4% had a day range under 10% (p5 = 11.08)
//     A floor on either would declare part of the fitting set off-universe.
//   * no band-resolvability clause — that is a PLACEMENT question, exactly what
//     resolveBaseRate()'s fallback chain exists for, not a POPULATION question.
//     Adding strictness production lacks would also break the single best test
//     available: that probing a ticker the 3:30 drop just scored reproduces the
//     drop's own answer.
//   * no isGameEligible clause — DECA tradeability is a rule of the game, not a
//     property of the fitted population. Reported as deca_eligible, never filtered.
const MIN_UNIVERSE_CHANGE_PCT = 5.0;
const MAJOR_EXCHANGES = new Set(["NASDAQ", "NYSE"]);

function classifyUniverse({ securityType, exchange, changePercent, onBoard }) {
  const failures = [];
  if (securityType !== "common") failures.push("not_common_stock");
  if (!MAJOR_EXCHANGES.has(exchange)) failures.push("not_major_exchange");
  const movedEnough = changePercent != null && changePercent >= MIN_UNIVERSE_CHANGE_PCT;
  if (!onBoard && !movedEnough) failures.push("move_below_threshold");
  return { in_universe: failures.length === 0, failures };
}

/** Scanner `type` + `typespecs` (d[8]/d[9]) → one word. */
function classifySecurity(type, specs) {
  const t = String(type ?? "").toLowerCase();
  const s = Array.isArray(specs) ? specs.map((x) => String(x).toLowerCase()) : [];
  if (t === "stock" && s.includes("common")) return "common";
  if (t === "stock" && s.includes("preferred")) return "preferred";
  if (t === "fund") return s.includes("etf") ? "etf" : "fund";
  if (t === "dr") return "dr";
  if (s.includes("warrant")) return "warrant";
  return t || "other";
}

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { tickers: [], flags: new Set(), opts: {} };
  const takesValue = new Set(["note", "out", "exchange"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out.tickers.push(a.toUpperCase()); continue; }
    const eq = a.indexOf("=");
    if (eq > 0) { out.opts[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const name = a.slice(2);
    if (takesValue.has(name)) { out.opts[name] = argv[++i] ?? ""; continue; }
    out.flags.add(name);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const STORE = !args.flags.has("no-store");
const WANT_FEATURES = !args.flags.has("no-features");
const AS_JSON = args.flags.has("json");
const OUT_PATH = args.opts.out || DEFAULT_OUT;

if (args.tickers.length === 0 || args.flags.has("help")) {
  console.log(`
Arbitrary-ticker probe for the Zenith quant engine (research only).

  node --env-file=.env.local scripts/probe.mjs <TICKER> [TICKER...] [flags]

  --no-store          compute and print, write nothing
  --no-features       skip the feature snapshot (skips the multi-MB FINRA
                      download, the Finnhub profile call and the DB reads)
  --json              emit the full result as JSON instead of the report
  --exchange=NASDAQ   disambiguate a symbol listed on more than one venue
  --note "..."        free text stored on the record
  --out <path>        JSONL destination (default ${DEFAULT_OUT})
  --force             run anyway inside the drop / EOD blackout windows

Pass every ticker on ONE command line — a shell loop re-downloads the whole
multi-MB FINRA file per invocation.
`);
  process.exit(args.tickers.length === 0 ? 1 : 0);
}
if (args.tickers.length > MAX_TICKERS) {
  console.error(`Refusing ${args.tickers.length} tickers; cap is ${MAX_TICKERS}. TradingView is an undocumented endpoint, Finnhub's free tier is 60/min and the SEC's is 10/s.`);
  process.exit(1);
}

// ── env guards ──────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (use --env-file=.env.local)");
  process.exit(1);
}
// Not politeness: the SEC blocks unidentified clients, edgarFetch() throws on a
// non-OK response (lib/quant/edgar.ts:64-79) and detectCatalyst() swallows it to
// null — which is indistinguishable from "nothing was filed". A silently blocked
// catalyst leg reported as "no filing" is the exact failure this refuses.
if (!process.env.SEC_EDGAR_USER_AGENT) {
  console.error('Missing SEC_EDGAR_USER_AGENT. Without it the SEC blocks us and every\nticker comes back "no fresh SEC filing" — indistinguishable from the truth.');
  process.exit(1);
}

// ── blackout windows ────────────────────────────────────────────────────────
// EDGAR, Finnhub and TradingView rate limits are shared with production.
function etClock() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      weekday: "short", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { weekday: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const BLACKOUTS = [
  [15 * 60 + 25, 15 * 60 + 45, "the ~3:30 pre-close drop"],
  [16 * 60 + 15, 16 * 60 + 30, "the ~4:20 EOD finalize"],
];
{
  const { weekday, minutes } = etClock();
  const weekend = weekday === "Sat" || weekday === "Sun";
  const hit = weekend ? null : BLACKOUTS.find(([a, b]) => minutes >= a && minutes < b);
  if (hit && !args.flags.has("force")) {
    console.error(`Inside the blackout window for ${hit[2]} (${String(Math.floor(hit[0]/60)).padStart(2,"0")}:${String(hit[0]%60).padStart(2,"0")}-${String(Math.floor(hit[1]/60)).padStart(2,"0")}:${String(hit[1]%60).padStart(2,"0")} ET).\nThe probe shares EDGAR / Finnhub / TradingView rate limits with production.\nWait, or pass --force if you know the run matters more.`);
    process.exit(1);
  }
}

// ── base-rate snapshot ──────────────────────────────────────────────────────
// gainer_base_rates is RLS-closed to anon and returns [] rather than an error,
// so reading it with the anon key would silently coin-flip EVERY ticker. The
// snapshot is how this script stays credential-free. 83 rows, recomputed only by
// a manual run of scripts/historical-base-rates.mjs.
function loadBaseRates() {
  if (!existsSync(BASE_RATES_PATH)) {
    console.error(`No base-rate snapshot at ${BASE_RATES_PATH}.

Create it once (this is the ONLY step that uses the service-role key, and it is
a single read you run by hand — the probe itself never holds that credential):

  mkdir -p ${HOME_DIR} && \\
  curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/gainer_base_rates?select=*" \\
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \\
    -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \\
  | python3 -c 'import json,sys,datetime; r=json.load(sys.stdin); print(json.dumps({"fetched_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"rows":r}))' \\
  > ${BASE_RATES_PATH}

Run it with the service key in your env, e.g. prefixed with
\`set -a; . .env.local; set +a;\`.`);
    process.exit(1);
  }
  const snap = JSON.parse(readFileSync(BASE_RATES_PATH, "utf8"));
  const rows = snap.rows ?? [];
  const newest = rows.map((r) => r.updated_at).filter(Boolean).sort().pop() ?? null;
  if (newest) {
    const ageDays = (Date.now() - new Date(newest).getTime()) / 86_400_000;
    if (ageDays > 90) {
      console.warn(`! base-rate snapshot is ${Math.round(ageDays)} days old (table updated_at ${newest}). Re-snapshot if the fit has been re-run.`);
    }
  }
  return { rows, updated_at: newest };
}

// ── compile the real engine ─────────────────────────────────────────────────
// `npx tsc <file>` ignores tsconfig.json ENTIRELY when handed input files on the
// command line, so the "@/*" path mapping is never read and the four aliased
// imports at lib/claude.ts:13,14,15,21 fail to COMPILE (not merely to emit — a
// runtime resolve hook cannot rescue this; measured).
//
// So: copy lib/ into the throwaway build and rewrite those four specifiers in
// the COPY. No repo file is modified, and nothing lands inside the working tree.
function buildEngine() {
  const build = mkdtempSync(join(tmpdir(), "zenith-probe-"));
  process.on("exit", () => { try { rmSync(build, { recursive: true, force: true }); } catch {} });

  const src = join(build, "src");
  cpSync(join(REPO_ROOT, "lib"), join(src, "lib"), { recursive: true });

  // lib/claude.ts sits at lib/, so "@/lib/x" is exactly "./x" from there.
  const claudePath = join(src, "lib", "claude.ts");
  const rewritten = readFileSync(claudePath, "utf8").replaceAll('from "@/lib/', 'from "./');
  if (rewritten.includes('from "@/')) {
    console.error("lib/claude.ts holds a path alias this script does not know how to rewrite.\nThe closure changed; update the rewrite in buildEngine().");
    process.exit(1);
  }
  writeFileSync(claudePath, rewritten);

  // The closure loads @anthropic-ai/sdk at import time (lib/quant/thesis.ts:28)
  // whatever the prose mode, and Node resolves packages by walking up to a
  // node_modules — so the build needs one. A symlink, not a copy.
  symlinkSync(join(REPO_ROOT, "node_modules"), join(build, "node_modules"), "dir");

  execFileSync(
    "npx",
    ["tsc", join(src, "lib", "claude.ts"), "--outDir", build, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop"],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  writeFileSync(join(build, "package.json"), '{"type":"commonjs"}');

  const entry = join(build, "claude.js");
  if (!existsSync(entry)) {
    console.error(`Expected ${entry}.\ntsc infers rootDir as the longest common prefix of the compiled closure —\ntoday that is lib/, which flattens the output. If something in the closure grew\nan import from outside lib/, rootDir moved up and the emitted paths shifted.`);
    process.exit(1);
  }
  const req = createRequire(import.meta.url);
  return {
    build,
    claude: req(entry),
    baseRates: req(join(build, "baseRates.js")),
    features: req(join(build, "quant", "features.js")),
    listing: req(join(build, "quant", "listing.js")),
    normalize: req(join(build, "marketdata", "normalize.js")),
    symbols: req(join(build, "marketdata", "symbols.js")),
    tradingview: req(join(build, "marketdata", "tradingview.js")),
    retry: req(join(build, "retry.js")),
    calendar: req(join(build, "market-calendar.js")),
  };
}

// ── scanner ─────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 8_000;

async function scan(engine, body) {
  const { SCAN_URL, USER_AGENT } = engine.tradingview;
  return engine.retry.withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(SCAN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": USER_AGENT,
          origin: "https://www.tradingview.com",
          referer: "https://www.tradingview.com/",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`scanner returned ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  });
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Mirrors lib/marketdata/tradingview.ts COLUMNS (:38-50) plus float shares.
// Re-declared rather than imported because those are module-private and the
// probe needs a different payload anyway — the same convention
// scripts/historical-base-rates.mjs and scripts/sector-check.mjs already use.
const RESOLVE_COLUMNS = [
  "name", "description", "close", "change", "volume", "relative_volume_10d_calc",
  "market_cap_basic", "sector", "type", "typespecs", "time", "float_shares_outstanding",
];

/**
 * Resolve a bare ticker to every US venue it trades on.
 *
 * A name-equality FILTER, not a prefixed symbol lookup: venue prefixes are not
 * enumerable. Measured — SPY is AMEX (NASDAQ:SPY and NYSE:SPY resolve to
 * nothing at all) and ARKK is CBOE, not AMEX/ARCA/BATS. The filter discovers the
 * venue instead of guessing it, which is also why this returns every hit rather
 * than picking one: a bare ticker is not an identifier.
 */
async function resolveTicker(engine, ticker) {
  const json = await scan(engine, {
    filter: [{ left: "name", operation: "equal", right: ticker }],
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: RESOLVE_COLUMNS,
    range: [0, 20],
    options: { lang: "en" },
  });
  return (json.data ?? []).map((entry) => {
    const d = entry.d;
    const exchange = engine.symbols.exchangeFromScannerSymbol(entry.s);
    const barSeconds = num(d[10]);
    return {
      scannerSymbol: entry.s,
      securityType: classifySecurity(d[8], d[9]),
      floatShares: num(d[11]),
      row: {
        ticker: d[0] ?? ticker,
        exchange,
        companyName: d[1] ?? null,
        price: num(d[2]),
        changePercent: num(d[3]),
        volume: num(d[4]),
        relativeVolume: num(d[5]),
        marketCap: num(d[6]),
        sector: d[7] ?? null,
        sessionDate: barSeconds && barSeconds > 0
          ? engine.calendar.formatDateKey(new Date(barSeconds * 1000))
          : null,
        // Inert. Nothing in generateAnalysis, scoreShort, buildFeatureSnapshots
        // or the prose path reads g.rank; 0 is out of band for every real rank
        // (rankAndFilter assigns i + 1) and never leaves this process.
        rank: 0,
      },
    };
  });
}

// Mirrors lib/quant/technicals.ts COLUMNS (:47-72) and its mapping (:128-155).
// Duplicated deliberately: that module builds its symbol list with
// `isAllowedExchange ? EXCHANGE:T : [NASDAQ:T, NYSE:T]` (:95-99), so for an ETF
// on AMEX or CBOE it asks for two symbols that do not exist and returns NOTHING
// — no RSI, no VWAP, no day high/low, hence no range band. Editing that file is
// out of bounds (it is on the live 3:30 drop path), so the probe fetches its own
// against already-qualified symbols. KEEP IN SYNC with lib/quant/technicals.ts.
const TECH_COLUMNS = [
  "name", "close", "RSI", "ATR", "SMA50", "SMA200", "gap", "change_from_open",
  "Volatility.D", "VWAP", "price_52_week_high", "float_shares_outstanding",
  "price_52_week_low", "Perf.W", "Perf.1M", "Perf.3M", "High.1M", "Low.1M",
  "High.3M", "Low.3M", "average_volume_10d_calc", "open", "high", "low",
];

async function fetchTechnicals(engine, qualifiedSymbols) {
  const out = new Map();
  if (qualifiedSymbols.length === 0) return out;
  try {
    const json = await scan(engine, {
      symbols: { tickers: qualifiedSymbols, query: { types: [] } },
      columns: TECH_COLUMNS,
      options: { lang: "en" },
    });
    for (const entry of json.data ?? []) {
      const d = entry.d;
      const ticker = d[0] ?? entry.s.split(":").pop();
      if (!ticker || out.has(ticker)) continue;
      out.set(ticker, {
        rsi: num(d[2]), atr: num(d[3]), sma50: num(d[4]), sma200: num(d[5]),
        gapPercent: num(d[6]), changeFromOpen: num(d[7]), volatilityD: num(d[8]),
        vwap: num(d[9]), high52w: num(d[10]), floatShares: num(d[11]),
        low52w: num(d[12]), perfW: num(d[13]), perf1M: num(d[14]), perf3M: num(d[15]),
        high1M: num(d[16]), low1M: num(d[17]), high3M: num(d[18]), low3M: num(d[19]),
        avgVol10d: num(d[20]), dayOpen: num(d[21]), dayHigh: num(d[22]), dayLow: num(d[23]),
      });
    }
  } catch (err) {
    console.warn("! technicals fetch failed — scoring without them:", err.message);
  }
  return out;
}

// ── report ──────────────────────────────────────────────────────────────────
const fmtPct = (v, dp = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`);
const fmtNum = (v, dp = 2) => (v == null ? "—" : v.toFixed(dp));
function fmtCap(v) {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}
const wrap = (text, indent) => {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 78 - indent.length) { lines.push(line); line = w; }
    else line = (line ? `${line} ` : "") + w;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? l : indent + l)).join("\n");
};

function printResult(r) {
  const label = (s) => s.padEnd(11);
  console.log(`\n${BAR}`);
  console.log(`${r.ticker}  ·  ${r.company_name ?? "—"}`);
  console.log(`${r.exchange ?? "?"}:${r.ticker}  ·  ${r.security_type}  ·  session ${r.session_date}`);
  console.log(BAR);
  console.log(`${label("TAPE")}${fmtPct(r.change_percent)} at $${fmtNum(r.price)}  ·  relvol ${fmtNum(r.relative_volume)}  ·  cap ${fmtCap(r.market_cap)}`);
  console.log(`${label("")}sector ${r.sector ?? "—"}  ·  DECA-eligible ${r.deca_eligible === null ? "—" : r.deca_eligible ? "yes" : "no"}`);
  if (r.technicals_present) {
    console.log(`${label("")}RSI ${fmtNum(r.rsi, 1)}  ·  vs open ${fmtPct(r.change_from_open, 1)}  ·  day range ${fmtPct(r.day_range_pct, 1)}`);
  } else {
    console.log(`${label("")}! no technicals returned for this symbol`);
  }

  if (r.in_universe) {
    console.log(`${label("UNIVERSE")}IN UNIVERSE${r.board_rank != null ? ` · on today's board at rank ${r.board_rank}` : " · by magnitude (not on today's board)"}`);
    console.log(`${label("")}prior: bucket ${r.base_rate_bucket ?? "—"}, n=${r.base_rate_n ?? "—"}, down-rate ${r.base_rate_down_rate == null ? "—" : (r.base_rate_down_rate * 100).toFixed(1) + "%"}`);
  } else {
    console.log(`${label("UNIVERSE")}OFF-UNIVERSE — failed: ${r.universe_failures.join(", ")}`);
    console.log(`${label("")}${wrap("gainer_base_rates (n=1,919) was fit ONLY on rows that made a top-gainer scrape. This row did not, so its \"closed lower next day\" prior does NOT apply and is NOT quoted.", " ".repeat(11))}`);
    console.log(`${label("")}PRIOR USED: 50% coin flip (lib/quant/score.ts FALLBACK_WIN).`);
  }

  console.log(`${label("CATALYST")}${r.catalyst_type ?? "—"}`);
  if (r.catalyst) console.log(`${label("")}${wrap(r.catalyst, " ".repeat(11))}`);
  if (r.catalyst_url) console.log(`${label("")}${r.catalyst_url}`);

  const em = r.expected_move_percent == null ? "— (no bucket)" : fmtPct(r.expected_move_percent, 1);
  console.log(`${label("SCORE")}${r.short_score}/10  ·  win estimate ${r.percent_win_estimate}%  ·  expected move ${em}`);
  if (r.prior_source === "coin_flip") {
    console.log(`${label("")}! Built on the coin-flip prior, not a fitted base rate. This number`);
    console.log(`${label("")}  carries no empirical edge — read the findings, not the score.`);
  }

  if (r.prose_source === "suppressed") {
    console.log(`${label("PROSE")}suppressed — the template narrative is written for a stock that`);
    console.log(`${label("")}spiked today (lib/quant/thesis.ts:258, :200).`);
  } else {
    console.log(`${label("PROSE")}${wrap(r.short_thesis ?? "—", " ".repeat(11))}`);
  }
  if (r.note) console.log(`${label("NOTE")}${r.note}`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const snapshot = loadBaseRates();
  const engine = buildEngine();
  const db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  let engineCommit = null;
  try {
    engineCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"],
      { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch { /* not fatal */ }

  // 1. Resolve every ticker to a concrete venue.
  const resolved = [];
  for (const t of args.tickers) {
    const hits = await resolveTicker(engine, t);
    if (hits.length === 0) {
      console.error(`${t}: not found on any US venue.`);
      continue;
    }
    let pick = hits;
    if (args.opts.exchange) {
      pick = hits.filter((h) => h.row.exchange === args.opts.exchange.toUpperCase());
    }
    if (pick.length > 1) {
      console.error(`${t}: listed on more than one venue — ${pick.map((h) => h.scannerSymbol).join(", ")}.\n     A bare ticker is not an identifier; re-run with --exchange=<VENUE>.`);
      continue;
    }
    if (pick.length === 0) {
      console.error(`${t}: no listing on ${args.opts.exchange}. Found: ${hits.map((h) => h.scannerSymbol).join(", ")}`);
      continue;
    }
    const hit = pick[0];
    if (!hit.row.sessionDate) {
      // Fail closed. The board deliberately fails open here because it has a
      // product to keep alive; a probe has nothing to protect and everything to
      // get wrong — an unknown session silently pairs today's tape with some
      // other day's filings.
      console.error(`${t}: scanner returned no session timestamp; refusing rather than guessing which session these figures describe.`);
      continue;
    }
    resolved.push(hit);
  }
  if (resolved.length === 0) process.exit(1);

  // 2. One technicals scan for the whole batch, on already-qualified symbols.
  const techs = await fetchTechnicals(engine, resolved.map((r) => r.scannerSymbol));

  // 3. Session date for the batch (the mode; halted names can carry a stale bar).
  const counts = new Map();
  for (const r of resolved) counts.set(r.row.sessionDate, (counts.get(r.row.sessionDate) ?? 0) + 1);
  const sessionDate = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const r of resolved) {
    if (r.row.sessionDate !== sessionDate) {
      console.warn(`! ${r.row.ticker} reports session ${r.row.sessionDate}, batch is ${sessionDate} (halted or stale bar).`);
    }
  }

  // 4. Board membership + streaks — both anon-readable (public-read RLS).
  const tickers = resolved.map((r) => r.row.ticker);
  const { data: boardRows } = await db
    .from("daily_gainers").select("ticker, rank").eq("date", sessionDate).in("ticker", tickers);
  const boardRank = new Map((boardRows ?? []).map((r) => [r.ticker, r.rank]));

  const { data: streakRows } = await db
    .from("ticker_streaks").select("ticker, streak_count, last_seen_date").in("ticker", tickers);
  const streaks = new Map();
  for (const s of streakRows ?? []) {
    // Only a streak confirmed for THIS session. ticker_streaks keeps stale rows,
    // and a stale count reaches lib/quant/thesis.ts:304 — "It has now topped the
    // gainers list N days in a row" — about a stock that is not on the list.
    if (s.last_seen_date === sessionDate) streaks.set(s.ticker, s.streak_count);
  }

  // 5. Universe verdict, then the prior — the one mechanism that matters.
  const verdicts = new Map();
  const baseRates = new Map();
  for (const r of resolved) {
    const t = r.row.ticker;
    const verdict = classifyUniverse({
      securityType: r.securityType,
      exchange: r.row.exchange,
      changePercent: r.row.changePercent,
      onBoard: boardRank.has(t),
    });
    verdicts.set(t, verdict);
    const tech = techs.get(t) ?? null;
    baseRates.set(t, verdict.in_universe
      ? engine.baseRates.resolveBaseRate(
          snapshot.rows, r.row.marketCap, r.row.relativeVolume,
          engine.baseRates.dayRangePct(tech?.dayHigh, tech?.dayLow))
      : null);
  }

  // 6. Feature snapshots. Reads only — daily_gainers and ticker_streaks resolve
  //    under anon; ai_analyses is Pro-gated so prior_call is always null here.
  let snapshots = new Map();
  if (WANT_FEATURES) {
    try {
      snapshots = await engine.features.buildFeatureSnapshots(
        db, resolved.map((r) => r.row), sessionDate, techs, streaks, baseRates);
    } catch (err) {
      console.warn("! feature snapshot failed — continuing without it:", err.message);
    }
  }

  // 7. Score + prose, one ticker at a time, through the real engine.
  const results = [];
  for (const r of resolved) {
    const g = r.row;
    const tech = techs.get(g.ticker) ?? null;
    const verdict = verdicts.get(g.ticker);
    const baseRate = baseRates.get(g.ticker) ?? null;
    const snap = snapshots.get(g.ticker) ?? null;

    const a = await engine.claude.generateAnalysis(
      g, sessionDate, streaks.get(g.ticker) ?? null, baseRate, tech, snap);
    if (!a) { console.error(`${g.ticker}: analysis failed.`); continue; }

    const suppressed = !verdict.in_universe;
    const bucket = baseRate
      ? `${baseRate.cap_band}|${baseRate.relvol_band}|${baseRate.range_band ?? "ALL"}`
      : null;

    results.push({
      session_date: sessionDate,
      ticker: g.ticker,
      exchange: g.exchange,
      scanner_symbol: r.scannerSymbol,
      company_name: g.companyName,
      security_type: r.securityType,
      price: g.price,
      change_percent: g.changePercent,
      volume: g.volume,
      relative_volume: g.relativeVolume,
      market_cap: g.marketCap,
      float_shares: r.floatShares ?? tech?.floatShares ?? null,
      sector: g.sector,
      in_universe: verdict.in_universe,
      universe_failures: verdict.failures,
      prior_source: baseRate ? "base_rate" : "coin_flip",
      base_rate_bucket: bucket,
      base_rate_n: baseRate?.n ?? null,
      base_rate_down_rate: baseRate?.down_rate ?? null,
      catalyst: a.catalyst,
      catalyst_url: a.catalyst_url || null,
      catalyst_type: a.catalyst_type,
      short_score: a.short_score,
      percent_win_estimate: a.percent_win_estimate,
      expected_move_percent: a.expected_move_percent,
      short_thesis: suppressed ? null : a.short_thesis,
      prose_source: suppressed ? "suppressed" : a.prose_source,
      listing_age_days: engine.listing.effectiveAgeDays(snap?.listing ?? null),
      features: snap,
      // isGameEligible() only REJECTS non-null figures below the floors, so a
      // null market cap — which is every ETF — sails through as `true`. The
      // production board never sees that case (it filters to common stock), but
      // the probe does, and "yes, a competitor could trade this" is a claim we
      // cannot make without a cap. Indeterminate is null, not true.
      deca_eligible: g.marketCap == null
        ? null
        : engine.normalize.isGameEligible(g.price, g.changePercent, g.marketCap),
      board_rank: boardRank.get(g.ticker) ?? null,
      technicals_present: tech != null,
      rsi: tech?.rsi ?? null,
      change_from_open: tech?.changeFromOpen ?? null,
      day_range_pct: engine.baseRates.dayRangePct(tech?.dayHigh, tech?.dayLow),
      engine_commit: engineCommit,
      base_rate_snapshot_updated_at: snapshot.updated_at,
      note: args.opts.note ?? null,
      probed_at: new Date().toISOString(),
    });
  }

  if (AS_JSON) console.log(JSON.stringify(results, null, 2));
  else results.forEach(printResult);

  // Under --json, stdout carries JSON and nothing else, so the output stays
  // pipeable into jq. Every human line goes to stderr.
  const say = AS_JSON ? console.error : console.log;
  if (STORE && results.length > 0) {
    mkdirSync(HOME_DIR, { recursive: true });
    appendFileSync(OUT_PATH, results.map((r) => JSON.stringify(r)).join("\n") + "\n");
    say(`\n${BAR}\nAppended ${results.length} record${results.length === 1 ? "" : "s"} to ${OUT_PATH}`);
  } else if (!STORE) {
    say(`\n${BAR}\n--no-store: nothing written.`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
