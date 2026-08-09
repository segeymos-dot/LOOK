import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true") return true;
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false") return false;

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  return !url || !key || url.includes("your-project");
}
