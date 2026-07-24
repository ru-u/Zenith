// Read-only probe for the sector/macro-spike detector (lib/quant/features.ts).
// For a given date (default: latest date in daily_gainers) it prints each
// top-5 ticker's sector, the mapped proxy-ETF day changes from the TradingView
// scanner, same-sector breadth on the board, and the would-flag verdict.
// Touches nothing — no ai_analyses writes, no emails.
//
//   node --env-file=.env.local scripts/sector-check.mjs [YYYY-MM-DD]
//
// NOTE: the scanner serves LIVE day changes only, so the ETF leg is accurate
// for today; on past dates it shows today's ETF tape next to that day's board.
// Thresholds/map MUST mirror SECTOR_PROXIES in lib/quant/features.ts.

import { createClient } from "@supabase/supabase-js";

const SECTOR_PROXIES = {
  "Energy Minerals": [
    { symbol: "USO", threshold: 3.0 },
    { symbol: "XLE", threshold: 2.5 },
  ],
  "Non-Energy Minerals": [
    { symbol: "GDX", threshold: 3.0 },
    { symbol: "XME", threshold: 2.5 },
  ],
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)");
  process.exit(1);
}
const db = createClient(url, key);

const argDate = process.argv[2];
let dateKey = argDate;
if (!dateKey) {
  const { data } = await db
    .from("daily_gainers")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  dateKey = data?.[0]?.date;
}
if (!dateKey) {
  console.error("No date found in daily_gainers.");
  process.exit(1);
}

const { data: rows, error } = await db
  .from("daily_gainers")
  .select("ticker, sector, change_percent, rank")
  .eq("date", dateKey)
  .order("rank", { ascending: true });
if (error) {
  console.error("daily_gainers query failed:", error.message);
  process.exit(1);
}

const breadth = new Map();
for (const r of rows ?? []) {
  if (r.sector) breadth.set(r.sector, (breadth.get(r.sector) ?? 0) + 1);
}

const symbols = [
  ...new Set(
    (rows ?? [])
      .flatMap((r) => SECTOR_PROXIES[r.sector] ?? [])
      .map((p) => p.symbol),
  ),
];

const etf = new Map();
if (symbols.length > 0) {
  const res = await fetch("https://scanner.tradingview.com/america/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      origin: "https://www.tradingview.com",
      referer: "https://www.tradingview.com/",
    },
    body: JSON.stringify({
      symbols: { tickers: symbols.map((s) => `AMEX:${s}`), query: { types: [] } },
      columns: ["name", "change"],
      options: { lang: "en" },
    }),
  });
  if (!res.ok) {
    console.error(`scanner returned ${res.status}`);
  } else {
    const json = await res.json();
    for (const e of json.data ?? []) {
      const name = e.d?.[0] ?? e.s?.split(":").pop();
      if (name && typeof e.d?.[1] === "number") etf.set(name, e.d[1]);
    }
  }
}

console.log(`\nSector check — board date ${dateKey} (ETF changes are LIVE today)\n`);
for (const r of (rows ?? []).slice(0, 5)) {
  const proxies = SECTOR_PROXIES[r.sector] ?? [];
  const moves = proxies.map((p) => {
    const chg = etf.get(p.symbol);
    const hit = chg != null && chg >= p.threshold;
    return `${p.symbol} ${chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "n/a"}${hit ? " ✓" : ""}`;
  });
  const count = breadth.get(r.sector) ?? 0;
  // Breadth is informational only — ~100 rows/day makes small counts noise.
  const flagged = proxies.some((p) => (etf.get(p.symbol) ?? -Infinity) >= p.threshold);
  console.log(
    `#${r.rank} ${r.ticker.padEnd(6)} +${(r.change_percent ?? 0).toFixed(1).padStart(5)}%  ` +
      `${(r.sector ?? "—").padEnd(22)} breadth=${count}  ` +
      `${moves.length ? moves.join("  ") : "(unmapped sector)"}  ` +
      `→ ${flagged ? "MACRO FLAG (score capped ≤4)" : "no flag"}`,
  );
}
console.log();
