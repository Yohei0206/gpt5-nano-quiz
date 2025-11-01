import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type BrowserSupabaseClient = SupabaseClient;

export function createBrowserSupabaseClient(): BrowserSupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("SUPABASE_URL または SUPABASE_ANON_KEY が未設定です");
    }
    return null;
  }
  return createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
