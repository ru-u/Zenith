import type { MarketDataProvider, ProviderName } from "./types";
import { tradingViewProvider } from "./tradingview";
import { polygonProvider } from "./polygon";

export * from "./types";

/**
 * Returns the active provider based on MARKET_DATA_PROVIDER (default tradingview).
 * Switching providers for the whole app is this one env var — no code changes.
 */
export function getProvider(): MarketDataProvider {
  const name = (process.env.MARKET_DATA_PROVIDER ?? "tradingview") as ProviderName;
  switch (name) {
    case "polygon":
      return polygonProvider;
    case "tradingview":
    default:
      return tradingViewProvider;
  }
}
