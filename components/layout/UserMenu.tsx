"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 sm:ml-1 sm:border-l sm:border-white/10 sm:pl-3">
      {/* Width grows with the name (truncates only past ~18 chars). */}
      <span className="hidden max-w-[18ch] truncate font-medium text-foreground/80 sm:inline">
        {name}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="text-muted-foreground hover:text-foreground"
      >
        Sign out
      </Button>
    </div>
  );
}
