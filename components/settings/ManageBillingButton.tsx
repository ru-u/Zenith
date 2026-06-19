"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Opens the Stripe Billing Portal (update card, view invoices, cancel).
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-portal", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Could not open the billing portal.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={openPortal}
        disabled={loading}
        variant="outline"
        className="w-fit"
      >
        {loading ? "Opening…" : "Manage billing"}
      </Button>
      {error && <p className="text-sm text-down">{error}</p>}
    </div>
  );
}
