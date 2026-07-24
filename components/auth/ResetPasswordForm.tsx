"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { resetAuthQueries } from "@/lib/authQueryReset";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // /auth/callback lands here with ?error=link when the recovery code was
  // missing, spent, or expired.
  const linkError = useSearchParams().get("error") !== null;
  const [linkState, setLinkState] = useState<"checking" | "ready" | "invalid">(
    linkError ? "invalid" : "checking",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (linkError) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setLinkState(data.session ? "ready" : "invalid");
    });
  }, [linkError]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Global sign-out also revokes the recovery session everywhere; the user
    // proves the new password by signing in with it.
    await supabase.auth.signOut();
    resetAuthQueries(queryClient);
    router.push("/auth/login?reset=success");
    router.refresh();
  }

  if (linkState === "checking") {
    return <p className="text-sm text-muted-foreground">Checking your reset link…</p>;
  }

  if (linkState === "invalid") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-down">This reset link is invalid or has expired.</p>
        <p className="text-sm text-muted-foreground">
          Links can only be used once, and only work in the browser you
          requested them from.
        </p>
        <Link href="/forgot-password" className="text-sm text-brand hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="password"
        name="new-password"
        autoComplete="new-password"
        aria-label="New password"
        required
        minLength={8}
        placeholder="New password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      <Input
        type="password"
        name="confirm-password"
        autoComplete="new-password"
        aria-label="Confirm new password"
        required
        minLength={8}
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      {error && (
        <p aria-live="polite" className="text-sm text-down">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={loading}
        className="bg-brand btn-brand text-brand-foreground"
      >
        {loading && <Loader2 aria-hidden className="mr-2 animate-spin" />}
        {loading ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
