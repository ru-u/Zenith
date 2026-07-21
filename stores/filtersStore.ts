import { create } from "zustand";

interface FiltersState {
  search: string;
  minPrice: number | null;
  minMarketCap: number | null;
  favoritesOnly: boolean;
  setSearch: (search: string) => void;
  setMinPrice: (n: number | null) => void;
  setMinMarketCap: (n: number | null) => void;
  setFavoritesOnly: (b: boolean) => void;
  reset: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  search: "",
  minPrice: null,
  minMarketCap: null,
  favoritesOnly: false,
  setSearch: (search) => set({ search }),
  setMinPrice: (minPrice) => set({ minPrice }),
  setMinMarketCap: (minMarketCap) => set({ minMarketCap }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
  reset: () =>
    set({ search: "", minPrice: null, minMarketCap: null, favoritesOnly: false }),
}));
