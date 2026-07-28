import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Supabase-klient bundet til ansattes innloggingscookie.
 * Brukes i server-komponenter og route handlers.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server-komponenter kan ikke skrive cookies. Middleware fornyer
          // sesjonen, sa dette er trygt a ignorere her.
        }
      },
    },
  });
}
