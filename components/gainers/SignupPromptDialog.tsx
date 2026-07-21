"use client";

import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSignupPromptStore } from "@/stores/signupPromptStore";
import { AuthGatePrompt } from "./AuthGatePrompt";

// Mounted once (screener page). A guest clicking any favorite star opens this
// instead of navigating to /auth/signup — so it's dismissible: click the
// backdrop, press Esc, or hit the ✕, exactly like the chart dialog. Fixes the
// "trapped on the signup page, only the logo gets you out" problem.
//
// Shares its body (medallion + copy + CTAs) with the chart gate via
// AuthGatePrompt, so both free-account prompts are visually identical. The
// glass-popover surface + brand-glow wash match the site's other popups.
export function SignupPromptDialog() {
  const next = useSignupPromptStore((s) => s.next);
  const close = useSignupPromptStore((s) => s.close);
  const encoded = next ? encodeURIComponent(next) : "";

  return (
    <Dialog open={next !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="glass-popover sm:max-w-sm overflow-hidden bg-transparent ring-0 p-6">
        {/* Brand bloom at the top, behind the medallion — echoes the page's
            gradient-mesh so the popup reads as part of the site. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-40 w-64 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl"
        />
        {/* The visible heading is rendered inside AuthGatePrompt; this hidden
            title supplies the dialog's accessible name for screen readers. */}
        <DialogTitle className="sr-only">Save your favorites</DialogTitle>
        <div className="relative">
          <AuthGatePrompt
            icon={Star}
            title="Save your favorites"
            description="Create a free account to favorite tickers and pin them to the top of your screener."
            next={encoded}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
