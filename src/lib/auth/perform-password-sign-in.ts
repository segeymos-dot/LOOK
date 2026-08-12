import { registerCurrentSession } from "@/lib/auth/account-sessions";
import type { SupabaseClient, Session, User } from "@supabase/supabase-js";

export type PasswordSignInResult =
  | { ok: true; user: User; session: Session }
  | { ok: false; errorMessage: string };

/**
 * Shared password sign-in used by JSON and native HTML form endpoints.
 * Does not log or persist the password.
 */
export async function performPasswordSignIn(
  supabase: SupabaseClient,
  params: {
    email: string;
    password: string;
    request: Request;
    ip: string;
  }
): Promise<PasswordSignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });

  if (error || !data.user || !data.session?.access_token) {
    return {
      ok: false,
      errorMessage: error?.message ?? "Invalid email or password",
    };
  }

  await registerCurrentSession(supabase, {
    userId: data.user.id,
    accessToken: data.session.access_token,
    userAgent: params.request.headers.get("user-agent"),
    ip: params.ip,
  });

  return { ok: true, user: data.user, session: data.session };
}
