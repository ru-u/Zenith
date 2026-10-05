import { create } from "zustand";
import { persist } from "zustand/middleware";

// What clicking a ticker (hero card / table row) does:
//   "chart"  — open the in-app TradingView chart dialog (default)
//   "google" — open a "<TICKER> stock" Google search in a new tab
export type TickerClickAction = "chart" | "google";

interface PreferencesState {
  tickerClick: TickerClickAction;
  setTickerClick: (action: TickerClickAction) => void;
  // The DECA diversification deadline (date key) this device marked as done.
  // Keyed by date rather than a boolean so next season's chip comes back.
  diversifiedFor: string | null;
  setDiversifiedFor: (deadline: string | null) => void;
}

// Device-local (localStorage), not per-account: it's a browsing preference,
// and keeping it out of `profiles` means no migration and it works signed out.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      tickerClick: "chart",
      setTickerClick: (tickerClick) => set({ tickerClick }),
      diversifiedFor: null,
      setDiversifiedFor: (diversifiedFor) => set({ diversifiedFor }),
    }),
    { name: "zenith-preferences" },
  ),
);
