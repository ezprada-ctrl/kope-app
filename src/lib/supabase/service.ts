import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Client service_role — bypass RLS sepenuhnya. HANYA untuk job server-side
 * tepercaya (cron backup), TIDAK PERNAH untuk request yang dipicu user.
 * `SUPABASE_SERVICE_ROLE_KEY` sengaja tanpa prefix `NEXT_PUBLIC_` — kalau
 * sampai ke bundle client, siapa pun bisa baca semua tabel tanpa RLS.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
