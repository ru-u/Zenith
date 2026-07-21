"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSignupPromptStore } from "@/stores/signupPromptStore";

// Mounted once (screener page). A guest clicking any favorite star opens this
// instead of navigating to /auth/signup — so it's dismissible: click the
// backdrop, press Esc, or hit the ✕, exactly like the chart dialog. Fixes the
// "trapped on the signup page, only the logo gets you out" problem.
export function SignupPromptDialog() {
  const next = useSignupPromptStore((s) => s.next);
  const close = useSignupPromptStore((s) => s.close);
  const encoded = next ? encodeURIComponent(next) : "";

  return (
    <Dialog open={next !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center gap-3 text-center">
          <div className="rounded-full bg-brand/10 p-3 text-brand">
            <Star className="h-6 w-6" aria-hidden />
          </div>
          <DialogTitle className="text-lg tracking-tight">
            Save your favorites
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Create a free account to favorite tickers and pin them to the top of
            your screener.
          </p>
        </DialogHeader>
        <div className="mt-1 flex items-center justify-center gap-3">
          <Link
            href={`/auth/signup?next=${encoded}`}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02]"
          >
            Create free account
          </Link>
          <Link
            href={`/auth/login?next=${encoded}`}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
