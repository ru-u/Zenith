import { create } from "zustand";

// Drives the single dismissible "create an account" dialog shown when a
// signed-out visitor clicks a favorite star. `next` non-null = open (and is the
// path to return to after auth); null = closed. One shared store so ~50 row
// stars trigger one app-level dialog instead of navigating the whole page away.
interface SignupPromptState {
  next: string | null;
  open: (next: string) => void;
  close: () => void;
}

export const useSignupPromptStore = create<SignupPromptState>((set) => ({
  next: null,
  open: (next) => set({ next }),
  close: () => set({ next: null }),
}));
