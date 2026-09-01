"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCooldown } from "@/hooks/useCooldown";
import { authEmailMessage, requestAuthEmail } from "@/lib/authEmail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cooldown = useCooldown();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldown.active) return;
    setLoading(true);
    // Goes through /api/auth/email rather than straight to Supabase, so the
    // send passes our rate limiter and lands in the security log. The route
    // returns the same generic result whether or not the account exists, so the
    // enumeration safety this form has always had is preserved — it just lives
    // on the server now.
    const result = await requestAuthEmail("password_reset", email);
    setNotice(authEmailMessage(result, "password_reset"));
    setLoading(false);
    // Don't make the user sit out a cooldown for a send that never happened.
    if (result === "ok") cooldown.start();
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
        disabled={loading || cooldown.active}
        className="bg-brand btn-brand text-brand-foreground"
      >
        {loading && <Loader2 aria-hidden className="mr-2 animate-spin" />}
        {loading
          ? "Sending…"
          : cooldown.active
            ? `Resend in ${cooldown.remaining}s`
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
