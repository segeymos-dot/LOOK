import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";

export const ACTIVITY_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const ONLINE_WINDOW_MS = 90_000;

export type ActivityKind = "customers" | "providers";

export type ActivityListItem = {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  createdAt: string;
  lastActivityAt: string | null;
  isOnline: boolean;
  sessionsCount: number;
  // customers
  ordersCreated: number;
  ordersActive: number;
  ordersCompleted: number;
  ordersCancelled: number;
  lastOrderAt: string | null;
  // providers
  offersSubmitted: number;
  jobsAccepted: number;
  jobsActive: number;
  jobsCompleted: number;
  lastOfferAt: string | null;
};

export type ActivityListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  onlineOnly?: boolean;
  neverOrdered?: boolean;
  hasActiveOrders?: boolean;
  registeredFrom?: string;
  registeredTo?: string;
  activityFrom?: string;
  activityTo?: string;
};

export type ActivityListResult = {
  items: ActivityListItem[];
  total: number;
  page: number;
  pageSize: number;
};

function rolesFor(kind: ActivityKind): UserRole[] {
  return kind === "customers" ? ["customer", "both"] : ["provider", "both"];
}

function clampPageSize(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return ACTIVITY_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

async function mapEmails(
  adminClient: SupabaseClient | null,
  ids: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const id of ids) map.set(id, null);
  if (!adminClient || ids.length === 0) return map;

  const wanted = new Set(ids);
  try {
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error || !data?.users?.length) break;
      for (const user of data.users) {
        if (!wanted.has(user.id)) continue;
        map.set(user.id, user.email ?? null);
        wanted.delete(user.id);
      }
      if (wanted.size === 0 || data.users.length < 200) break;
    }
  } catch {
    // leave null
  }
  return map;
}

type ProfileLite = {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

/**
 * Paginated role activity list for admin stats.
 * Uses service-role client when available (after requireAdminContext).
 */
export async function listRoleActivity(
  supabase: SupabaseClient,
  adminClient: SupabaseClient | null,
  kind: ActivityKind,
  query: ActivityListQuery
): Promise<ActivityListResult> {
  const db = adminClient ?? supabase;
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = clampPageSize(query.pageSize);
  const roles = rolesFor(kind);
  const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();

  // Online user ids (role-flagged presence).
  const presenceFlag = kind === "customers" ? "is_customer" : "is_provider";
  const { data: onlineRows } = await db
    .from("app_presence")
    .select("user_id")
    .eq(presenceFlag, true)
    .not("user_id", "is", null)
    .gt("last_heartbeat_at", onlineCutoff);

  const onlineIds = new Set(
    (onlineRows ?? [])
      .map((r) => r.user_id as string | null)
      .filter((id): id is string => Boolean(id))
  );

  let allowedIds: string[] | null = null;

  if (query.onlineOnly) {
    if (onlineIds.size === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    allowedIds = [...onlineIds];
  }

  // Pre-filter neverOrdered / hasActiveOrders via request aggregates.
  if (kind === "customers" && (query.neverOrdered || query.hasActiveOrders)) {
    const { data: reqRows } = await db
      .from("requests")
      .select("customer_id, status")
      .is("trashed_at", null);
    const created = new Set<string>();
    const active = new Set<string>();
    for (const row of reqRows ?? []) {
      const cid = row.customer_id as string;
      created.add(cid);
      if (["open", "in_progress", "pending_review"].includes(row.status as string)) {
        active.add(cid);
      }
    }
    if (query.neverOrdered) {
      const { data: allProfiles } = await db
        .from("profiles")
        .select("id")
        .eq("is_platform_admin", false)
        .in("role", roles);
      const neverIds = (allProfiles ?? [])
        .map((p) => p.id as string)
        .filter((id) => !created.has(id));
      if (neverIds.length === 0) return { items: [], total: 0, page, pageSize };
      if (allowedIds === null) allowedIds = neverIds;
      else {
        const set = new Set(neverIds);
        allowedIds = allowedIds.filter((id) => set.has(id));
      }
    }
    if (query.hasActiveOrders) {
      if (active.size === 0) return { items: [], total: 0, page, pageSize };
      const activeIds = [...active];
      if (allowedIds === null) allowedIds = activeIds;
      else {
        const set = new Set(activeIds);
        allowedIds = allowedIds.filter((id) => set.has(id));
      }
    }
  }

  let profileQuery = db
    .from("profiles")
    .select("id, full_name, role, created_at, updated_at", { count: "exact" })
    .eq("is_platform_admin", false)
    .in("role", roles);

  const idFilter = allowedIds;
  if (idFilter !== null) {
    if (idFilter.length === 0) return { items: [], total: 0, page, pageSize };
    profileQuery = profileQuery.in("id", idFilter);
  }

  if (query.q?.trim()) {
    const q = query.q.trim();
    profileQuery = profileQuery.ilike("full_name", `%${q}%`);
  }
  if (query.registeredFrom) {
    profileQuery = profileQuery.gte("created_at", query.registeredFrom);
  }
  if (query.registeredTo) {
    profileQuery = profileQuery.lte("created_at", `${query.registeredTo}T23:59:59.999Z`);
  }

  const sort = query.sort ?? "newest";
  if (sort === "oldest") {
    profileQuery = profileQuery.order("created_at", { ascending: true });
  } else if (sort === "activity") {
    profileQuery = profileQuery.order("updated_at", { ascending: false });
  } else if (sort === "name") {
    profileQuery = profileQuery.order("full_name", { ascending: true });
  } else {
    profileQuery = profileQuery.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: profiles, error, count } = await profileQuery.range(from, to);
  if (error) throw new Error(error.message);

  const rows = (profiles ?? []) as ProfileLite[];
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return { items: [], total: count ?? 0, page, pageSize };
  }

  const emails = await mapEmails(adminClient, ids);

  // Sessions counts
  const { data: sessionRows } = await db
    .from("app_sessions")
    .select("user_id")
    .in("user_id", ids);
  const sessionCounts = new Map<string, number>();
  for (const row of sessionRows ?? []) {
    const uid = row.user_id as string;
    sessionCounts.set(uid, (sessionCounts.get(uid) ?? 0) + 1);
  }

  // Last visitor activity
  const { data: visitorRows } = await db
    .from("app_visitors")
    .select("user_id, last_seen_at")
    .in("user_id", ids);
  const lastSeen = new Map<string, string>();
  for (const row of visitorRows ?? []) {
    const uid = row.user_id as string;
    const seen = row.last_seen_at as string;
    const prev = lastSeen.get(uid);
    if (!prev || seen > prev) lastSeen.set(uid, seen);
  }

  const orderStats = new Map<
    string,
    {
      created: number;
      active: number;
      completed: number;
      cancelled: number;
      lastOrderAt: string | null;
    }
  >();
  const offerStats = new Map<
    string,
    {
      submitted: number;
      accepted: number;
      active: number;
      completed: number;
      lastOfferAt: string | null;
    }
  >();

  if (kind === "customers") {
    const { data: reqs } = await db
      .from("requests")
      .select("customer_id, status, created_at")
      .in("customer_id", ids)
      .is("trashed_at", null);
    for (const id of ids) {
      orderStats.set(id, {
        created: 0,
        active: 0,
        completed: 0,
        cancelled: 0,
        lastOrderAt: null,
      });
    }
    for (const row of reqs ?? []) {
      const cid = row.customer_id as string;
      const st = orderStats.get(cid);
      if (!st) continue;
      st.created += 1;
      const status = row.status as string;
      if (["open", "in_progress", "pending_review"].includes(status)) st.active += 1;
      if (status === "completed") st.completed += 1;
      if (status === "cancelled") st.cancelled += 1;
      const createdAt = row.created_at as string;
      if (!st.lastOrderAt || createdAt > st.lastOrderAt) st.lastOrderAt = createdAt;
    }
  } else {
    const { data: offers } = await db
      .from("offers")
      .select("provider_id, status, created_at, request_id")
      .in("provider_id", ids);
    for (const id of ids) {
      offerStats.set(id, {
        submitted: 0,
        accepted: 0,
        active: 0,
        completed: 0,
        lastOfferAt: null,
      });
    }
    const acceptedRequestIds: string[] = [];
    const acceptedByProvider = new Map<string, string[]>();
    for (const row of offers ?? []) {
      const pid = row.provider_id as string;
      const st = offerStats.get(pid);
      if (!st) continue;
      st.submitted += 1;
      const createdAt = row.created_at as string;
      if (!st.lastOfferAt || createdAt > st.lastOfferAt) st.lastOfferAt = createdAt;
      if (row.status === "accepted") {
        st.accepted += 1;
        const rid = row.request_id as string;
        acceptedRequestIds.push(rid);
        const list = acceptedByProvider.get(pid) ?? [];
        list.push(rid);
        acceptedByProvider.set(pid, list);
      }
    }
    if (acceptedRequestIds.length > 0) {
      const { data: reqs } = await db
        .from("requests")
        .select("id, status")
        .in("id", [...new Set(acceptedRequestIds)])
        .is("trashed_at", null);
      const statusById = new Map(
        (reqs ?? []).map((r) => [r.id as string, r.status as string])
      );
      for (const [pid, rids] of acceptedByProvider) {
        const st = offerStats.get(pid);
        if (!st) continue;
        for (const rid of rids) {
          const status = statusById.get(rid);
          if (!status) continue;
          if (["open", "in_progress", "pending_review"].includes(status)) st.active += 1;
          if (status === "completed") st.completed += 1;
        }
      }
    }
  }

  // Activity date filters applied after enrichment (last activity).
  let items: ActivityListItem[] = rows.map((p) => {
    const visitorSeen = lastSeen.get(p.id) ?? null;
    const lastActivityAt =
      visitorSeen && visitorSeen > p.updated_at
        ? visitorSeen
        : p.updated_at || visitorSeen;
    const o = orderStats.get(p.id);
    const of = offerStats.get(p.id);
    return {
      id: p.id,
      fullName: p.full_name,
      email: emails.get(p.id) ?? null,
      role: p.role,
      createdAt: p.created_at,
      lastActivityAt,
      isOnline: onlineIds.has(p.id),
      sessionsCount: sessionCounts.get(p.id) ?? 0,
      ordersCreated: o?.created ?? 0,
      ordersActive: o?.active ?? 0,
      ordersCompleted: o?.completed ?? 0,
      ordersCancelled: o?.cancelled ?? 0,
      lastOrderAt: o?.lastOrderAt ?? null,
      offersSubmitted: of?.submitted ?? 0,
      jobsAccepted: of?.accepted ?? 0,
      jobsActive: of?.active ?? 0,
      jobsCompleted: of?.completed ?? 0,
      lastOfferAt: of?.lastOfferAt ?? null,
    };
  });

  if (query.activityFrom) {
    const fromTs = new Date(query.activityFrom).getTime();
    items = items.filter(
      (i) => i.lastActivityAt && new Date(i.lastActivityAt).getTime() >= fromTs
    );
  }
  if (query.activityTo) {
    const toTs = new Date(`${query.activityTo}T23:59:59.999Z`).getTime();
    items = items.filter(
      (i) => i.lastActivityAt && new Date(i.lastActivityAt).getTime() <= toTs
    );
  }

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
  };
}
