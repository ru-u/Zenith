import type { MarketDataProvider } from "./types";
import { tradingViewProvider } from "./tradingview";

export * from "./types";

/**
 * The active market-data provider. TradingView is the sole provider; the
 * MarketDataProvider interface stays the seam so another source can be added
 * later without touching the cron, cache, API routes, or UI.
 */
export function getProvider(): MarketDataProvider {
  return tradingViewProvider;
}
