import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { applyAuthCookieOptions, getAuthCookieOptions } from "@/lib/supabase/auth-cookie-options";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, applyAuthCookieOptions(options))
          );
        } catch {
          // Called from Server Component — ignore
        }
      },
    },
  });
}
