"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { resetAuthQueries } from "@/lib/authQueryReset";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthDivider, GoogleButton } from "./GoogleButton";
import { ResendConfirmation } from "./ResendConfirmation";

export function SignupForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Honor ?next= (e.g. /auth/signup?next=/upgrade from Pro CTAs); default to
  // the screener (the tool), not the marketing landing.
  const next = useSearchParams().get("next") ?? "/screener";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim(), full_name: name.trim() },
        // Confirm back to the origin the user actually signed up on, matching
        // ForgotPasswordForm/GoogleButton. Without this, Supabase builds the
        // link from the dashboard's Site URL — so with one project shared
        // between dev and prod, a localhost signup confirms into production.
        // Bare /auth/callback lands on /screener (the route's `next` default).
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // If email confirmation is required, there's no active session yet.
    if (data.session) {
      // Drop the guest-scoped cache so favorites/streaks refetch as this user.
      resetAuthQueries(queryClient);
      router.push(next);
      router.refresh();
    } else {
      // No session means confirmation is required. Name the expiry: the link is
      // good for 24 hours and the unconfirmed account is deleted 24 hours after
      // the last send, so "get to this today" is real information, not filler.
      setNotice(
        "Check your email to confirm your account, then sign in. The link expires in 24 hours.",
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <GoogleButton next={next} />
      <AuthDivider />
      <Input
        type="text"
        name="name"
        autoComplete="name"
        aria-label="Your name"
        required
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
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
      <Input
        type="password"
        name="password"
        autoComplete="new-password"
        aria-label="Password"
        required
        minLength={8}
        placeholder="Password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      {error && (
        <p aria-live="polite" className="text-sm text-down">
          {error}
        </p>
      )}
      {notice && (
        <div
          aria-live="polite"
          className="rounded-lg border border-up/20 bg-up/5 p-3"
        >
          <p className="text-sm text-up">{notice}</p>
          {/* The mail can land in spam or never arrive at all; without this the
              only recovery is signing up again after the account is pruned. */}
          <ResendConfirmation email={email} className="mt-2" />
        </div>
      )}
      <Button type="submit" disabled={loading} className="bg-brand btn-brand text-brand-foreground">
        {loading && <Loader2 aria-hidden className="mr-2 animate-spin" />}
        {loading ? "Creating account…" : "Create free account"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="text-brand hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-brand hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={
            next === "/screener"
              ? "/auth/login"
              : `/auth/login?next=${encodeURIComponent(next)}`
          }
          className="text-brand hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
