import { createClient } from "@/lib/supabase/client";

export type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
};

/** Sync browser Supabase client after server-side sign-in/sign-up (sets cookies via API). */
export async function syncClientSession(
  session?: AuthSessionPayload | null
): Promise<boolean> {
  const supabase = createClient();

  if (session?.access_token && session?.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    return !error;
  }

  const {
    data: { session: existing },
  } = await supabase.auth.getSession();

  return Boolean(existing);
}
