"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCooldown } from "@/hooks/useCooldown";
import { authEmailMessage, requestAuthEmail } from "@/lib/authEmail";
import { Field } from "./Field";
import { Button } from "@/components/ui/button";
import { useCaptcha } from "./CaptchaField";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cooldown = useCooldown();
  const captcha = useCaptcha();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldown.active) return;
    setLoading(true);
    // Goes through /api/auth/email rather than straight to Supabase, so the
    // send passes our rate limiter and lands in the security log. The route
    // returns the same generic result whether or not the account exists, so the
    // enumeration safety this form has always had is preserved — it just lives
    // on the server now.
    const result = await requestAuthEmail("password_reset", email, captcha.token);
    setNotice(authEmailMessage(result, "password_reset"));
    setLoading(false);
    // Don't make the user sit out a cooldown for a send that never happened.
    if (result === "ok") cooldown.start();
    // Single-use token: anything other than a clean send leaves a spent one in
    // state, so the retry would fail the captcha rather than the original cause.
    else captcha.reset();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field
        id="forgot-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        spellCheck={false}
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {notice && (
        <p aria-live="polite" className="text-sm text-up">
          {notice}
        </p>
      )}
      {captcha.field}
      <Button
        type="submit"
        disabled={loading || cooldown.active}
        className="h-10 bg-brand btn-brand text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70"
      >
        {loading && <Loader2 aria-hidden className="mr-2 animate-spin" />}
        {loading
          ? "Sending…"
          : cooldown.active
            ? `Resend in ${cooldown.remaining}s`
            : "Send reset link"}
      </Button>
      <p className="border-t border-foreground/10 pt-3 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/auth/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
