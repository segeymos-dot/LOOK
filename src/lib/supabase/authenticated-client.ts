import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAuthenticatedClient(accessToken: string) {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
