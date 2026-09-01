"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCooldown } from "@/hooks/useCooldown";
import { authEmailMessage, requestAuthEmail } from "@/lib/authEmail";

/**
 * "Didn't get the email?" — the way back for someone whose confirmation never
 * arrived or got lost.
 *
 * Without this, an unconfirmed account is a dead end: sign-in refuses, the
 * confirmation link expires after 24h, and the account itself is deleted 24h
 * after the last send. Shown on the signup notice and on the login form when
 * sign-in fails specifically because the address was never confirmed.
 */
export function ResendConfirmation({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const cooldown = useCooldown();

  async function resend() {
    if (sending || cooldown.active || !email) return;
    setSending(true);
    setNotice(null);
    const result = await requestAuthEmail("confirmation", email);
    setNotice(authEmailMessage(result, "confirmation"));
    setSending(false);
    // Only hold the button when a send was actually accepted. Starting the
    // cooldown after a failure would make the user wait out a minute for
    // nothing.
    if (result === "ok") cooldown.start();
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={resend}
        disabled={sending || cooldown.active || !email}
        className="inline-flex items-center text-sm text-brand underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
      >
        {sending && <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />}
        {sending
          ? "Sending…"
          : cooldown.active
            ? `Resend in ${cooldown.remaining}s`
            : "Resend confirmation email"}
      </button>
      {notice && (
        <p aria-live="polite" className="mt-1.5 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
