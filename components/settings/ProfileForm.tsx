"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Display name lives in the auth user's metadata (full_name) — the Header and
// menu read it from there, so no profiles-table column is needed.
export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await createClient().auth.updateUser({
      data: { full_name: name.trim() },
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="display-name" className="text-sm font-medium">
          Display name
        </label>
        <Input
          id="display-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your name"
          maxLength={60}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input id="email" value={email} disabled className="opacity-70" />
        <p className="text-xs text-muted-foreground">
          Email is tied to your login and can&apos;t be changed here.
        </p>
      </div>

      {error && <p className="text-sm text-down">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={saving || name.trim() === initialName.trim()}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && <span className="text-sm text-up">Saved ✓</span>}
      </div>
    </form>
  );
}
