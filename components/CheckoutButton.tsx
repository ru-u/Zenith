"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRO_PRICE_MONTHLY } from "@/lib/pricing";

export function CheckoutButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", { method: "POST" });
      const { url } = (await res.json()) as { url?: string };
      if (url) {
        window.location.href = url;
        return;
      }
    } catch {
      // fall through
    }
    setError("Couldn't start checkout — please try again.");
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={go}
        disabled={loading}
        className={cn(
          "mt-7 block w-full rounded-lg bg-brand btn-brand px-4 py-2.5 text-center text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02] disabled:opacity-60",
          className,
        )}
      >
        {loading && (
          <Loader2
            aria-hidden
            className="-mt-0.5 mr-2 inline-block h-4 w-4 animate-spin"
          />
        )}
        {loading ? "Redirecting to checkout…" : `Upgrade to Pro · ${PRO_PRICE_MONTHLY}`}
      </button>
      {error && (
        <p aria-live="polite" className="mt-2 text-center text-sm text-down">
          {error}
        </p>
      )}
    </>
  );
}
