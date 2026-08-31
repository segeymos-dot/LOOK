import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeSessionId,
  normalizeVisitorId,
} from "@/lib/admin/presence-validation";
import { countryFromRequest } from "@/lib/analytics/geo-country";

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
  /** Non-trashed requests — same set as /admin/orders tab=all. */
  totalOrders: number;
  /** status=completed, non-trashed, non-archived — /admin/orders?tab=completed. */
  completedOrders: number;
  /** Non-completed, non-cancelled, non-trashed, non-archived. */
  activeOrders: number;
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

/** Canonical snake_case payload for /api/admin/stats (and UI consumers). */
export type AdminPlatformStatsPayload = {
  registered_users: number;
  registered_customers: number;
  registered_providers: number;
  customer_online: number;
  provider_online: number;
  total_orders: number;
  completed_orders: number;
  active_orders: number;
  total_visits: number;
  unique_visitors: number;
  visits_today: number;
  admin_sessions_total: number;
  admin_sessions_today: number;
};

export function toAdminPlatformStatsPayload(
  stats: AdminUserStats
): AdminPlatformStatsPayload {
  return {
    registered_users: stats.registeredUsers,
    registered_customers: stats.registeredCustomers,
    registered_providers: stats.registeredProviders,
    customer_online: stats.customersOnline,
    provider_online: stats.providersOnline,
    total_orders: stats.totalOrders,
    completed_orders: stats.completedOrders,
    active_orders: stats.activeOrders,
    total_visits: stats.totalVisits,
    unique_visitors: stats.uniqueVisitors,
    visits_today: stats.visitsToday,
    admin_sessions_total: stats.adminVisitsTotal,
    admin_sessions_today: stats.adminVisitsToday,
  };
}

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
  total_orders?: number;
  completed_orders?: number;
  active_orders?: number;
  users_online?: number;
  customers_online?: number;
  customer_online?: number;
  providers_online?: number;
  provider_online?: number;
  unique_visitors?: number;
  total_visits?: number;
  visits_today?: number;
  unique_visitors_today?: number;
  admin_visits_total?: number;
  admin_visits_today?: number;
  admin_sessions_total?: number;
  admin_sessions_today?: number;
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
  const totalOrders = Number(raw?.total_orders ?? 0);
  const completedOrders = Number(raw?.completed_orders ?? 0);
  const activeOrdersRaw = raw?.active_orders;
  const activeOrders =
    activeOrdersRaw === undefined || activeOrdersRaw === null
      ? Math.max(0, totalOrders - completedOrders)
      : Number(activeOrdersRaw);
  const customersOnline = Number(
    raw?.customers_online ?? raw?.customer_online ?? 0
  );
  const providersOnline = Number(
    raw?.providers_online ?? raw?.provider_online ?? 0
  );
  const adminVisitsTotal = Number(
    raw?.admin_sessions_total ?? raw?.admin_visits_total ?? 0
  );
  const adminVisitsToday = Number(
    raw?.admin_sessions_today ?? raw?.admin_visits_today ?? 0
  );

  return {
    registeredCustomers: Number(raw?.registered_customers ?? 0),
    registeredProviders: Number(raw?.registered_providers ?? 0),
    registeredUsers: Number(raw?.registered_users ?? 0),
    totalOrders,
    completedOrders,
    activeOrders,
    usersOnline: Number(raw?.users_online ?? 0),
    customersOnline,
    providersOnline,
    uniqueVisitors: Number(raw?.unique_visitors ?? 0),
    totalVisits: Number(raw?.total_visits ?? 0),
    visitsToday: Number(raw?.visits_today ?? 0),
    uniqueVisitorsToday: Number(raw?.unique_visitors_today ?? 0),
    adminVisitsTotal,
    adminVisitsToday,
    adminVisitsByUser: mapAdminVisitsByUser(raw?.admin_visits_by_user),
    onlineWindowSeconds: Number(raw?.online_window_seconds ?? 180),
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
  // Prefer canonical RPC; fall back to legacy alias during rollout.
  const primary = await supabase.rpc("get_admin_platform_stats");
  let data = primary.data;
  let error = primary.error;

  if (error) {
    const legacy = await supabase.rpc("get_admin_user_stats");
    data = legacy.data;
    error = legacy.error;
  }

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
  const country = request
    ? countryFromRequest(request)
    : { countryCode: "XX", countryName: "Unknown" };

  const supabase = await createPresenceClient(request);
  const { data, error } = await supabase.rpc("record_app_heartbeat", {
    p_visitor_id: visitorId,
    p_session_id: sessionId,
    p_user_id: null,
    p_country_code: country.countryCode,
    p_country_name: country.countryName,
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
