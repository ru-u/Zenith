"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Matches Supabase's own per-address resend limit.
const COOLDOWN_SECONDS = 60;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown === 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldown > 0) return;
    setLoading(true);
    const supabase = createClient();
    try {
      // The result is deliberately ignored: the notice must read the same
      // whether or not the account exists.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
    } catch {
      // Swallow transport errors too — same generic notice either way.
    }
    setNotice("If an account exists for that email, we've sent a reset link.");
    setLoading(false);
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="email"
        name="email"
        autoComplete="email"
        spellCheck={false}
        aria-label="Email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      {notice && (
        <p aria-live="polite" className="text-sm text-up">
          {notice}
        </p>
      )}
      <Button
        type="submit"
        disabled={loading || cooldown > 0}
        className="bg-brand btn-brand text-brand-foreground"
      >
        {loading && <Loader2 aria-hidden className="mr-2 animate-spin" />}
        {loading
          ? "Sending…"
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/auth/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
