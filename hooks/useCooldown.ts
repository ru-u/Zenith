"use client";

import { useEffect, useState } from "react";

/**
 * Countdown for "you can do that again in Ns" buttons.
 *
 * Extracted from ForgotPasswordForm once resend appeared on the login and
 * signup forms too. The default matches Supabase's own per-address resend
 * interval, so the button re-enables at roughly the moment a retry would
 * actually be accepted rather than bouncing off a server-side limit.
 */
export function useCooldown(defaultSeconds = 60) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining === 0) return;
    const id = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return {
    remaining,
    active: remaining > 0,
    start: (seconds = defaultSeconds) => setRemaining(seconds),
  };
}
