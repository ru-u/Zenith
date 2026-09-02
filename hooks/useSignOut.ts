"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { resetAuthQueries } from "@/lib/authQueryReset";

// One sign-out implementation, shared by the desktop <UserMenu> and the mobile
// nav drawer. Both entry points must clear the auth-scoped TanStack cache
// before navigating (see lib/authQueryReset.ts) — duplicating that was the
// obvious way for the two menus to drift apart.
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async function signOut() {
    await createClient().auth.signOut();
    // Clear this user's favorites/streaks so they don't linger for the next visitor.
    resetAuthQueries(queryClient);
    router.push("/");
    router.refresh();
  };
}
