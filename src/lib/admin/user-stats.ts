import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeSessionId,
  normalizeVisitorId,
} from "@/lib/admin/presence-validation";

export type AdminVisitByUser = {
  userId: string;
  name: string | null;
  email: string | null;
  visitsTotal: number;
  visitsToday: number;
  lastSeenAt: string | null;
};

export type AdminUserStats = {
  registeredCustomers: number;
  registeredProviders: number;
  /** Distinct non-admin profiles (one account = one count, any role). */
  registeredUsers: number;
  usersOnline: number;
  customersOnline: number;
  providersOnline: number;
  /** Lifetime unique visitors (anonymous + users), platform admins excluded. */
  uniqueVisitors: number;
  /** Lifetime app sessions (anonymous + users), platform admins excluded. */
  totalVisits: number;
  visitsToday: number;
  uniqueVisitorsToday: number;
  /** Auth login sessions for platform admins (user_sessions.created_at). */
  adminVisitsTotal: number;
  adminVisitsToday: number;
  adminVisitsByUser: AdminVisitByUser[];
  onlineWindowSeconds: number;
  /** Platform admins are excluded from online counters. */
  adminsCountedInOnline: boolean;
  /** Platform admins are excluded from user visit counters. */
  adminsCountedInUserVisits: boolean;
  /** ISO start of "today" in dayTimezone (Europe/Moscow calendar day). */
  dayStart: string | null;
  /** IANA timezone used for day_start / *Today counters. */
  dayTimezone: string | null;
  /** Backend source for admin session counters. */
  adminSessionSource: string | null;
};

type RpcAdminVisitByUser = {
  user_id?: string;
  name?: string | null;
  visits_total?: number;
  visits_today?: number;
  last_seen_at?: string | null;
};

type RpcStats = {
  registered_customers?: number;
  registered_providers?: number;
  registered_users?: number;
  users_online?: number;
  customers_online?: number;
  providers_online?: number;
  unique_visitors?: number;
  total_visits?: number;
  visits_today?: number;
  unique_visitors_today?: number;
  admin_visits_total?: number;
  admin_visits_today?: number;
  admin_visits_by_user?: RpcAdminVisitByUser[] | null;
  online_window_seconds?: number;
  admins_counted_in_online?: boolean;
  admins_counted_in_user_visits?: boolean;
  day_start?: string | null;
  day_timezone?: string | null;
  admin_session_source?: string | null;
};

function mapAdminVisitsByUser(
  raw: RpcAdminVisitByUser[] | null | undefined
): AdminVisitByUser[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => ({
    userId: String(row.user_id ?? ""),
    name: row.name ?? null,
    email: null,
    visitsTotal: Number(row.visits_total ?? 0),
    visitsToday: Number(row.visits_today ?? 0),
    lastSeenAt: row.last_seen_at ?? null,
  })).filter((row) => row.userId);
}

function mapStats(raw: RpcStats | null): AdminUserStats {
  return {
    registeredCustomers: Number(raw?.registered_customers ?? 0),
    registeredProviders: Number(raw?.registered_providers ?? 0),
    registeredUsers: Number(raw?.registered_users ?? 0),
    usersOnline: Number(raw?.users_online ?? 0),
    customersOnline: Number(raw?.customers_online ?? 0),
    providersOnline: Number(raw?.providers_online ?? 0),
    uniqueVisitors: Number(raw?.unique_visitors ?? 0),
    totalVisits: Number(raw?.total_visits ?? 0),
    visitsToday: Number(raw?.visits_today ?? 0),
    uniqueVisitorsToday: Number(raw?.unique_visitors_today ?? 0),
    adminVisitsTotal: Number(raw?.admin_visits_total ?? 0),
    adminVisitsToday: Number(raw?.admin_visits_today ?? 0),
    adminVisitsByUser: mapAdminVisitsByUser(raw?.admin_visits_by_user),
    onlineWindowSeconds: Number(raw?.online_window_seconds ?? 90),
    adminsCountedInOnline: Boolean(raw?.admins_counted_in_online ?? false),
    adminsCountedInUserVisits: Boolean(raw?.admins_counted_in_user_visits ?? false),
    dayStart: raw?.day_start ?? null,
    dayTimezone: raw?.day_timezone ?? null,
    adminSessionSource: raw?.admin_session_source ?? null,
  };
}

async function enrichAdminEmails(
  adminClient: SupabaseClient | null,
  stats: AdminUserStats
): Promise<AdminUserStats> {
  if (!adminClient || stats.adminVisitsByUser.length === 0) return stats;

  const enriched = await Promise.all(
    stats.adminVisitsByUser.map(async (row) => {
      try {
        const { data, error } = await adminClient.auth.admin.getUserById(row.userId);
        if (error || !data.user) return row;
        return { ...row, email: data.user.email ?? null };
      } catch {
        return row;
      }
    })
  );

  return { ...stats, adminVisitsByUser: enriched };
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
  supabase: SupabaseClient,
  adminClient?: SupabaseClient | null
): Promise<AdminUserStats> {
  const { data, error } = await supabase.rpc("get_admin_user_stats");
  if (error) throw new Error(error.message);
  const mapped = mapStats((data ?? null) as RpcStats | null);
  return enrichAdminEmails(adminClient ?? null, mapped);
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
  const visitorId = normalizeVisitorId(input.visitorId);
  if (!visitorId) {
    throw new Error("Invalid visitor id");
  }

  const sessionId = normalizeSessionId(input.sessionId);

  const supabase = await createPresenceClient(request);
  const { data, error } = await supabase.rpc("record_app_heartbeat", {
    p_visitor_id: visitorId,
    p_session_id: sessionId,
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
  const visitorId = normalizeVisitorId(input.visitorId);
  if (!visitorId) return;

  const sessionId = normalizeSessionId(input.sessionId);

  try {
    const supabase = await createPresenceClient(request);
    await supabase.rpc("end_app_presence", {
      p_visitor_id: visitorId,
      p_session_id: sessionId,
    });
  } catch {
    // Best-effort on unload / logout.
  }
}

/** Service-role cleanup of stale presence (optional maintenance). */
export async function purgeStalePresence(olderThanSeconds = 600): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin.rpc("purge_stale_app_presence", {
      p_older_than: `${olderThanSeconds} seconds`,
    });
  } catch {
    // ignore if service role unavailable
  }
}
