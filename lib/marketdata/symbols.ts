// The one home for ticker/symbol string handling. A bare ticker like "BIOT" is
// NOT a unique identifier — on the day Instinct Bio debuted on Nasdaq
// (2026-07-24), TradingView's bare-symbol search resolved "BIOT" to BitMEX's
// ".BIOT" crypto index and Google resolved it to an Amsterdam-listed ETF
// (AMS:BIOT). Only "NASDAQ:BIOT" is unambiguous. The scanner tells us the real
// exchange on every row (`s: "NASDAQ:BIOT"`); everything downstream must carry
// it and qualify any symbol string it hands to an external system.
//
// Client-safe: no server-only imports — StockChart uses this in the browser.

/** The only venues the screener admits (mirrors the scanner payload filter). */
export const ALLOWED_EXCHANGES = ["NASDAQ", "NYSE"] as const;

export function isAllowedExchange(exchange: string): boolean {
  return (ALLOWED_EXCHANGES as readonly string[]).includes(exchange);
}

/** "NASDAQ:BIOT" → "NASDAQ"; null when there's no recognizable prefix. */
export function exchangeFromScannerSymbol(s: string): string | null {
  const i = s.indexOf(":");
  return i > 0 ? s.slice(0, i) : null;
}

/**
 * Fully qualified TradingView symbol ("NASDAQ:BIOT"). Rows persisted before
 * the exchange column existed have `exchange: null` — fall back to the bare
 * ticker (old behavior: TradingView guesses, usually right for established
 * names; the ambiguity window is brand-new listings, which always come from
 * fresh scans and therefore always carry an exchange).
 */
export function qualifiedSymbol(
  exchange: string | null | undefined,
  ticker: string,
): string {
  return exchange && isAllowedExchange(exchange)
    ? `${exchange}:${ticker}`
    : ticker;
}
