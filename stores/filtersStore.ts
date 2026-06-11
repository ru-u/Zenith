import { create } from "zustand";

interface FiltersState {
  search: string;
  minPrice: number | null;
  minMarketCap: number | null;
  setSearch: (search: string) => void;
  setMinPrice: (n: number | null) => void;
  setMinMarketCap: (n: number | null) => void;
  reset: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  search: "",
  minPrice: null,
  minMarketCap: null,
  setSearch: (search) => set({ search }),
  setMinPrice: (minPrice) => set({ minPrice }),
  setMinMarketCap: (minMarketCap) => set({ minMarketCap }),
  reset: () => set({ search: "", minPrice: null, minMarketCap: null }),
}));
