import { create } from "zustand";

// Drives the single dismissible "create an account" dialog shown when a
// signed-out visitor clicks a favorite star. `next` non-null = open (and is the
// path to return to after auth); null = closed. One shared store so ~50 row
// stars trigger one app-level dialog instead of navigating the whole page away.
//
// `reason` picks the dialog's copy, so the prompt names the feature the guest
// actually clicked (a locked day-range meter used to open "Save your
// favorites").
export type SignupPromptReason = "favorite" | "day-range";

interface SignupPromptState {
  next: string | null;
  reason: SignupPromptReason;
  open: (next: string, reason?: SignupPromptReason) => void;
  close: () => void;
}

export const useSignupPromptStore = create<SignupPromptState>((set) => ({
  next: null,
  reason: "favorite",
  open: (next, reason = "favorite") => set({ next, reason }),
  close: () => set({ next: null }),
}));
