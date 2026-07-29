import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminUserStats = {
  registeredCustomers: number;
  registeredProviders: number;
  usersOnline: number;
  providersOnline: number;
  uniqueVisitors: number;
  totalVisits: number;
  onlineWindowSeconds: number;
};

type RpcStats = {
  registered_customers?: number;
  registered_providers?: number;
  users_online?: number;
  providers_online?: number;
  unique_visitors?: number;
  total_visits?: number;
  online_window_seconds?: number;
};

function mapStats(raw: RpcStats | null): AdminUserStats {
  return {
    registeredCustomers: Number(raw?.registered_customers ?? 0),
    registeredProviders: Number(raw?.registered_providers ?? 0),
    usersOnline: Number(raw?.users_online ?? 0),
    providersOnline: Number(raw?.providers_online ?? 0),
    uniqueVisitors: Number(raw?.unique_visitors ?? 0),
    totalVisits: Number(raw?.total_visits ?? 0),
    onlineWindowSeconds: Number(raw?.online_window_seconds ?? 90),
  };
}

/** Prefer Bearer token (browser authFetch / Electron); fall back to cookie session. */
export async function createPresenceClient(request?: Request): Promise<SupabaseClient> {
  const accessToken = request?.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (accessToken) {
    return createAuthenticatedClient(accessToken);
  }

  return createClient();
}

/** Admin-only stats. Caller must already be verified as platform admin. */
export async function fetchAdminUserStats(
  supabase: SupabaseClient
): Promise<AdminUserStats> {
  const { data, error } = await supabase.rpc("get_admin_user_stats");
  if (error) throw new Error(error.message);
  return mapStats((data ?? null) as RpcStats | null);
}

export type HeartbeatResult = {
  ok: boolean;
  visitorId: string;
  sessionId: string;
  newSession: boolean;
};

export async function recordAppHeartbeat(
  input: {
    visitorId: string;
    sessionId?: string | null;
  },
  request?: Request
): Promise<HeartbeatResult> {
  const visitorId = input.visitorId.trim();
  if (visitorId.length < 8) {
    throw new Error("Invalid visitor id");
  }

  const supabase = await createPresenceClient(request);
  const { data, error } = await supabase.rpc("record_app_heartbeat", {
    p_visitor_id: visitorId,
    p_session_id: input.sessionId || null,
    p_user_id: null,
  });

  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as {
    ok?: boolean;
    visitor_id?: string;
    session_id?: string;
    new_session?: boolean;
  };

  return {
    ok: Boolean(raw.ok),
    visitorId: String(raw.visitor_id ?? visitorId),
    sessionId: String(raw.session_id ?? ""),
    newSession: Boolean(raw.new_session),
  };
}

export async function endAppPresence(
  input: {
    visitorId: string;
    sessionId?: string | null;
  },
  request?: Request
): Promise<void> {
  const visitorId = input.visitorId.trim();
  if (visitorId.length < 8) return;

  try {
    const supabase = await createPresenceClient(request);
    await supabase.rpc("end_app_presence", {
      p_visitor_id: visitorId,
      p_session_id: input.sessionId || null,
    });
  } catch {
    // Best-effort on unload / logout.
  }
}

/** Service-role cleanup of stale presence (optional maintenance). */
export async function purgeStalePresence(olderThanSeconds = 300): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const cutoff = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
    await admin.from("app_presence").delete().lt("last_heartbeat_at", cutoff);
  } catch {
    // ignore if service role unavailable
  }
}
