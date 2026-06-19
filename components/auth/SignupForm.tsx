"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SignupForm() {
  const router = useRouter();
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
      options: { data: { full_name: name.trim() } },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // If email confirmation is required, there's no active session yet.
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setNotice("Check your email to confirm your account, then sign in.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="text"
        required
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
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
        minLength={6}
        placeholder="Password (min 6 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border-foreground/10 bg-foreground/5"
      />
      {error && <p className="text-sm text-down">{error}</p>}
      {notice && <p className="text-sm text-up">{notice}</p>}
      <Button type="submit" disabled={loading} className="bg-brand text-brand-foreground hover:bg-brand/90">
        {loading ? "Creating account…" : "Create free account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
