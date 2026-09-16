import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * User-scoped Supabase client for Route Handlers.
 * Authorization Bearer is the caller JWT so PostgREST sets auth.uid()
 * (needed by SECURITY DEFINER RPCs such as record_app_heartbeat).
 * Do not use the `accessToken` client option — it disables supabase.auth.*.
 */
export function createAuthenticatedClient(accessToken: string) {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
