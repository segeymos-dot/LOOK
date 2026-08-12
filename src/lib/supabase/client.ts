import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (!browserClient) {
    // isSingleton: false — LOOK owns the singleton so resetBrowserClient()
    // can recreate with the same auth options (incl. passkey opt-in).
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      isSingleton: false,
      auth: {
        experimental: {
          passkey: true,
        },
      },
    });
  }
  return browserClient;
}

/** Drop the singleton so the next login cannot reuse a dirty auth client. */
export function resetBrowserClient() {
  browserClient = undefined;
}
