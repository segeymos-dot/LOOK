import { createClient, resetBrowserClient } from "@/lib/supabase/client";
import { clearPrivateClientStorage } from "@/lib/auth/sign-out-cleanup";

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

/**
 * If another account is already signed in locally, clear it before server sign-in
 * so Set-Cookie / setSession cannot race with a stale session.
 * @returns true when a different local session was cleared.
 */
export async function clearLocalSessionBeforeLogin(
  nextEmail: string
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const currentEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const target = nextEmail.trim().toLowerCase();

  if (!currentEmail || currentEmail === target) {
    return false;
  }

  clearPrivateClientStorage();
  await supabase.auth.signOut({ scope: "local" });
  resetBrowserClient();
  return true;
}

async function sessionMatchesUserId(expectedUserId: string): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id || session.user.id !== expectedUserId) {
    return false;
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return false;
  return user.id === expectedUserId;
}

/**
 * Ensure the browser sees the same user the server just authenticated.
 * One refresh retry only — never logs tokens.
 */
export async function confirmClientSession(
  expectedUserId: string
): Promise<boolean> {
  if (await sessionMatchesUserId(expectedUserId)) {
    return true;
  }

  const supabase = createClient();
  await supabase.auth.refreshSession();

  return sessionMatchesUserId(expectedUserId);
}

/** Default post-password-login path: platform admins land on admin stats. */
export async function resolvePasswordLoginRedirect(
  requestedRedirect: string
): Promise<string> {
  const requested = requestedRedirect || "/";
  if (requested !== "/") return requested;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return requested;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_platform_admin) {
    return "/admin/stats";
  }
  return requested;
}
