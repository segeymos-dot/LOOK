import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decodeAccessTokenClaims,
  deviceLabelFromUserAgent,
} from "@/lib/auth/session-meta";

export type AccountSessionRow = {
  id: string;
  auth_session_id: string;
  device_label: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  is_current: boolean;
};

export async function registerCurrentSession(
  supabase: SupabaseClient,
  input: {
    userId: string;
    accessToken: string;
    userAgent?: string | null;
    ip?: string | null;
  }
): Promise<string | null> {
  const claims = decodeAccessTokenClaims(input.accessToken);
  const authSessionId = claims?.session_id;
  if (!authSessionId) return null;

  const deviceLabel = deviceLabelFromUserAgent(input.userAgent);
  const { data, error } = await supabase.rpc("upsert_user_session", {
    p_user_id: input.userId,
    p_auth_session_id: authSessionId,
    p_device_label: deviceLabel,
    p_user_agent: input.userAgent ?? null,
    p_ip: input.ip ?? null,
  });

  if (error) {
    console.error("[account-sessions] upsert failed", error.message);
    return null;
  }

  await supabase.rpc("log_account_security_event", {
    p_user_id: input.userId,
    p_event_type: "session_registered",
    p_metadata: { auth_session_id: authSessionId, device_label: deviceLabel },
    p_ip: input.ip ?? null,
    p_user_agent: input.userAgent ?? null,
  });

  return (data as string) ?? null;
}

export async function listAccountSessions(
  supabase: SupabaseClient,
  userId: string,
  currentAuthSessionId: string | null
): Promise<AccountSessionRow[]> {
  const { data, error } = await supabase
    .from("user_sessions")
    .select(
      "id, auth_session_id, device_label, user_agent, ip, created_at, last_seen_at, revoked_at"
    )
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[account-sessions] list failed", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    is_current: Boolean(
      currentAuthSessionId && row.auth_session_id === currentAuthSessionId
    ),
  }));
}

export async function revokeAccountSession(
  supabase: SupabaseClient,
  userId: string,
  authSessionId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc("revoke_user_session", {
    p_user_id: userId,
    p_auth_session_id: authSessionId,
  });
  if (error) return { success: false, error: error.message };

  // Per-session Auth token delete is not exposed on the public client.
  // Row is marked revoked; "Sign out everywhere" uses Auth global/others scope.
  await supabase.rpc("log_account_security_event", {
    p_user_id: userId,
    p_event_type: "session_revoked",
    p_metadata: { auth_session_id: authSessionId },
  });

  return { success: true };
}

export async function revokeAllAccountSessions(
  supabase: SupabaseClient,
  userId: string,
  exceptAuthSessionId: string | null,
  options?: { includeCurrent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const except = options?.includeCurrent ? null : exceptAuthSessionId;
  const { error } = await supabase.rpc("revoke_all_user_sessions", {
    p_user_id: userId,
    p_except_auth_session_id: except,
  });
  if (error) return { success: false, error: error.message };

  // Prefer client-side supabase.auth.signOut({ scope }) from the caller.
  // Admin API requires a user JWT (not user id); service-role global revoke
  // is handled in /api/auth/sign-out when a bearer token is present.

  await supabase.rpc("log_account_security_event", {
    p_user_id: userId,
    p_event_type: options?.includeCurrent
      ? "sign_out_all_devices"
      : "sign_out_other_devices",
    p_metadata: {},
  });

  return { success: true };
}

export async function listSecurityEvents(
  supabase: SupabaseClient,
  userId: string,
  limit = 20
) {
  const { data, error } = await supabase
    .from("account_security_events")
    .select("id, event_type, metadata, ip, user_agent, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[account-sessions] security events failed", error.message);
    return [];
  }
  return data ?? [];
}
