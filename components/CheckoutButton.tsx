"use client";

import { useState } from "react";

export function CheckoutButton() {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
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
    setLoading(false);
  }

  return (
    <button
      onClick={go}
      disabled={loading}
      className="mt-7 block w-full rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02] disabled:opacity-60"
    >
      {loading ? "Redirecting to checkout…" : "Upgrade to Pro · $4.99/mo"}
    </button>
  );
}
