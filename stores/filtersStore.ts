import { create } from "zustand";

interface FiltersState {
  sector: string | null;
  search: string;
  minChangePercent: number | null;
  setSector: (sector: string | null) => void;
  setSearch: (search: string) => void;
  setMinChangePercent: (min: number | null) => void;
  reset: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  sector: null,
  search: "",
  minChangePercent: null,
  setSector: (sector) => set({ sector }),
  setSearch: (search) => set({ search }),
  setMinChangePercent: (minChangePercent) => set({ minChangePercent }),
  reset: () => set({ sector: null, search: "", minChangePercent: null }),
}));
