import { createClient, resetBrowserClient } from "@/lib/supabase/client";
import { clearPrivateClientStorage } from "@/lib/auth/sign-out-cleanup";

export type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
};

/**
 * Sync browser Supabase client after flows that intentionally return tokens
 * (passkey / register). Password login must NOT call this with tokens — the
 * server Set-Cookie is the sole auth-cookie writer for that path.
 */
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
 * so Set-Cookie cannot race with a stale session.
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

export type ServerSessionProbe = {
  ok: boolean;
  userId: string | null;
  isPlatformAdmin: boolean;
};

/**
 * Durability check: a fresh same-origin GET that reads SSR cookies via
 * server getUser(). Never logs tokens. Does not call refreshSession/setSession.
 */
export async function confirmServerSession(
  expectedUserId: string
): Promise<ServerSessionProbe> {
  // Drop any in-memory client so the next reads come from document.cookie
  // (populated by the sign-in Set-Cookie response).
  resetBrowserClient();

  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    user?: { id?: string } | null;
    is_platform_admin?: boolean;
  } | null;

  const userId =
    typeof body?.user?.id === "string" ? body.user.id : null;
  const ok =
    response.ok &&
    Boolean(body?.success) &&
    userId !== null &&
    userId === expectedUserId;

  return {
    ok,
    userId,
    isPlatformAdmin: Boolean(body?.is_platform_admin),
  };
}

/** Default post-password-login path: platform admins land on admin stats. */
export function resolvePasswordLoginRedirect(
  requestedRedirect: string,
  isPlatformAdmin: boolean
): string {
  const requested = requestedRedirect || "/";
  if (isPlatformAdmin && requested === "/") {
    return "/admin/stats";
  }
  return requested;
}
