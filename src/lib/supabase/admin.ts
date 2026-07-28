import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

let cached: SupabaseClient | undefined;

/**
 * Service role-klient. Omgar RLS og ma aldri eksponeres mot nettleseren.
 * Brukes til brukeradministrasjon, Storage og til a kringkaste Realtime-meldinger.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
