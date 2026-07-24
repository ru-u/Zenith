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

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  // Post-auth default is the screener (the tool), not the marketing landing.
  const next = params.get("next") ?? "/screener";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Seed with any error handed back by /auth/callback (OAuth failures).
  const [error, setError] = useState<string | null>(params.get("error"));
  const [loading, setLoading] = useState(false);
  // Coded param (not free text) so a crafted URL can't display arbitrary copy.
  const notice =
    params.get("reset") === "success"
      ? "Password updated — sign in with your new password."
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Drop the guest-scoped cache so favorites/streaks refetch as this user.
    resetAuthQueries(queryClient);
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <GoogleButton next={next} />
      <AuthDivider />
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
        autoComplete="current-password"
        aria-label="Password"
        required
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      <div className="-mt-1.5 text-right">
        <Link
          href="/forgot-password"
          className="text-xs text-muted-foreground transition-colors hover:text-brand"
        >
          Forgot password?
        </Link>
      </div>
      {error && (
        <p aria-live="polite" className="text-sm text-down">
          {error}
        </p>
      )}
      {notice && !error && (
        <p aria-live="polite" className="text-sm text-up">
          {notice}
        </p>
      )}
      <Button type="submit" disabled={loading} className="bg-brand btn-brand text-brand-foreground">
        {loading && <Loader2 aria-hidden className="mr-2 animate-spin" />}
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          href={
            next === "/screener"
              ? "/auth/signup"
              : `/auth/signup?next=${encodeURIComponent(next)}`
          }
          className="text-brand hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
