"use client";

import { Star, Gauge, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSignupPromptStore,
  type SignupPromptReason,
} from "@/stores/signupPromptStore";
import { AuthGatePrompt } from "./AuthGatePrompt";

// Mounted once (screener page). A guest clicking any favorite star — or a
// locked day-range meter — opens this
// instead of navigating to /auth/signup — so it's dismissible: click the
// backdrop, press Esc, or hit the ✕, exactly like the chart dialog. Fixes the
// "trapped on the signup page, only the logo gets you out" problem.
//
// Shares its body (medallion + copy + CTAs) with the chart gate via
// AuthGatePrompt, so both free-account prompts are visually identical. The
// glass-popover surface + brand-glow wash match the site's other popups.
const COPY: Record<
  SignupPromptReason,
  { icon: LucideIcon; title: string; description: string }
> = {
  favorite: {
    icon: Star,
    title: "Save your favorites",
    description:
      "Create a free account to favorite tickers and pin them to the top of your screener.",
  },
  "day-range": {
    icon: Gauge,
    title: "See where it sits in today's range",
    description:
      "Create a free account to see each gainer's day range: how far it has pulled back from today's high.",
  },
};

export function SignupPromptDialog() {
  const next = useSignupPromptStore((s) => s.next);
  const reason = useSignupPromptStore((s) => s.reason);
  const copy = COPY[reason];
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
        <DialogTitle className="sr-only">{copy.title}</DialogTitle>
        <div className="relative">
          <AuthGatePrompt
            icon={copy.icon}
            title={copy.title}
            description={copy.description}
            next={encoded}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
