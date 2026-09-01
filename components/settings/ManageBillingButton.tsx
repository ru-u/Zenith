"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

// The error codes /api/stripe/create-portal can return, mapped to something a
// person can act on. Without this the button rendered the raw code — a comped
// account (Pro tier, no Stripe customer) showed the literal "no_subscription".
const PORTAL_ERRORS: Record<string, string> = {
  no_subscription:
    "There's no paid subscription linked to this account, so there's nothing to manage here.",
  portal_unavailable: `Billing is temporarily unavailable. Try again in a few minutes — if it keeps happening, email ${LEGAL_CONTACT_EMAIL}.`,
  "auth required": "Your session expired. Please sign in again.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
};

function messageFor(code?: string): string {
  return (
    (code && PORTAL_ERRORS[code]) ||
    "Couldn't open the billing portal. Please try again."
  );
}

// Opens the Stripe Billing Portal (update card, view invoices, cancel).
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-portal", { method: "POST" });
      // Tolerate a body-less response: a 429 from an upstream proxy rather
      // than from lib/ratelimit.ts wouldn't carry JSON.
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && json.url) {
        // Navigating away — deliberately stay in the loading state so the
        // button can't be double-clicked during the redirect.
        window.location.href = json.url;
        return;
      }
      setError(
        messageFor(json.error ?? (res.status === 429 ? "rate_limited" : undefined)),
      );
    } catch {
      setError(messageFor());
    }
    setLoading(false);
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
      {error && (
        <p aria-live="polite" className="text-sm text-down">
          {error}
        </p>
      )}
    </div>
  );
}
