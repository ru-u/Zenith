"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthDivider, GoogleButton } from "./GoogleButton";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Post-auth default is the screener (the tool), not the marketing landing.
  const next = params.get("next") ?? "/screener";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Seed with any error handed back by /auth/callback (OAuth failures).
  const [error, setError] = useState<string | null>(params.get("error"));
  const [loading, setLoading] = useState(false);

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
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <GoogleButton next={next} />
      <AuthDivider />
      <Input
        type="email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      <Input
        type="password"
        required
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      {error && <p className="text-sm text-down">{error}</p>}
      <Button type="submit" disabled={loading} className="bg-brand text-brand-foreground hover:bg-brand/90">
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
