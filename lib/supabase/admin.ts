import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role client — BYPASSES RLS. Server-only.
 * NEVER import this from a "use client" component. Use only in API routes,
 * route handlers, server components, and cron jobs.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
