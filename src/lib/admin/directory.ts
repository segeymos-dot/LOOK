import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfferStatus,
  OrderPaymentStatus,
  RequestStatus,
  UserRole,
} from "@/types";

export const ADMIN_PAGE_SIZE = 20;

/**
 * After requireAdminContext(), prefer the service-role client for directory reads.
 * Participant-scoped RLS blocks offers/conversations/messages/work_submissions for admins.
 * Never expose this client to the browser.
 */
function adminDataClient(
  supabase: SupabaseClient,
  adminClient: SupabaseClient | null
): SupabaseClient {
  return adminClient ?? supabase;
}

export type AdminDirectoryKind = "customers" | "providers";

export type AdminUserListItem = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  role: UserRole;
  account_status: "active";
  email_verified: boolean | null;
  phone_verified: boolean;
  created_at: string;
  last_activity_at: string;
  provider_category_slugs: string[];
  rating: number;
  reviews_count: number;
  completed_orders_count: number;
  // Aggregates (customers)
  requests_created: number;
  requests_completed: number;
  requests_cancelled: number;
  // Aggregates (providers)
  offers_submitted: number;
  jobs_accepted: number;
  jobs_completed: number;
  jobs_cancelled: number;
  available_balance: number | null;
  pending_payout: number | null;
  total_earned: number | null;
  balance_currency: string | null;
  disputes_count: number;
  profile_complete: boolean | null;
};

export type AdminListResult = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminListQuery = {
  q?: string;
  city?: string;
  status?: string;
  category?: string;
  sort?: string;
  page?: number;
  minOrders?: number;
  minRating?: number;
  registeredFrom?: string;
  registeredTo?: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  role: UserRole;
  phone_verified: boolean | null;
  created_at: string;
  updated_at: string;
  provider_category_slugs: string[] | null;
  rating: number | null;
  reviews_count: number | null;
  completed_orders_count: number | null;
  bio?: string | null;
  skills?: string | null;
  portfolio_items?: unknown;
};

function isProfileComplete(p: ProfileRow): boolean {
  const hasPortfolio = Array.isArray(p.portfolio_items) && p.portfolio_items.length > 0;
  return Boolean(
    p.full_name?.trim() &&
      p.bio?.trim() &&
      p.phone?.trim() &&
      (p.skills?.trim() || hasPortfolio)
  );
}

function rolesForKind(kind: AdminDirectoryKind): UserRole[] {
  return kind === "customers" ? ["customer", "both"] : ["provider", "both"];
}

function safeStripePrefix(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Show only a short safe prefix — never full secrets.
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 10)}…`;
}

async function mapEmails(
  adminClient: SupabaseClient | null,
  ids: string[]
): Promise<Map<string, { email: string | null; email_verified: boolean | null }>> {
  const map = new Map<string, { email: string | null; email_verified: boolean | null }>();
  for (const id of ids) map.set(id, { email: null, email_verified: null });
  if (!adminClient || ids.length === 0) return map;

  const wanted = new Set(ids);
  // Prefer a bounded listUsers scan over N parallel getUserById calls (more reliable locally).
  try {
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error || !data?.users?.length) break;
      for (const user of data.users) {
        if (!wanted.has(user.id)) continue;
        map.set(user.id, {
          email: user.email ?? null,
          email_verified: Boolean(user.email_confirmed_at),
        });
        wanted.delete(user.id);
      }
      if (wanted.size === 0 || data.users.length < 200) break;
    }
  } catch {
    // leave null emails
  }

  // Fallback for any remaining ids.
  await Promise.all(
    [...wanted].map(async (id) => {
      try {
        const { data, error } = await adminClient.auth.admin.getUserById(id);
        if (error || !data.user) return;
        map.set(id, {
          email: data.user.email ?? null,
          email_verified: Boolean(data.user.email_confirmed_at),
        });
      } catch {
        // keep null
      }
    })
  );

  return map;
}

async function findProfileIdsByEmail(
  adminClient: SupabaseClient | null,
  q: string
): Promise<string[] | null> {
  if (!adminClient || !q.includes("@")) return null;
  const needle = q.toLowerCase();
  const matched: string[] = [];

  // Local admin directory: scan a bounded number of auth users.
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (user.email?.toLowerCase().includes(needle)) {
        matched.push(user.id);
      }
    }
    if (data.users.length < 200) break;
  }

  return matched;
}

async function countRequestsByCustomer(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<{
  created: Map<string, number>;
  completed: Map<string, number>;
  cancelled: Map<string, number>;
}> {
  const created = new Map<string, number>();
  const completed = new Map<string, number>();
  const cancelled = new Map<string, number>();
  for (const id of userIds) {
    created.set(id, 0);
    completed.set(id, 0);
    cancelled.set(id, 0);
  }
  if (userIds.length === 0) return { created, completed, cancelled };

  const { data } = await supabase
    .from("requests")
    .select("customer_id, status")
    .in("customer_id", userIds)
    .is("trashed_at", null);

  for (const row of data ?? []) {
    const id = row.customer_id as string;
    created.set(id, (created.get(id) ?? 0) + 1);
    if (row.status === "completed") completed.set(id, (completed.get(id) ?? 0) + 1);
    if (row.status === "cancelled") cancelled.set(id, (cancelled.get(id) ?? 0) + 1);
  }
  return { created, completed, cancelled };
}

async function countJobsByProvider(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<{
  offers: Map<string, number>;
  accepted: Map<string, number>;
  completed: Map<string, number>;
  cancelled: Map<string, number>;
}> {
  const offers = new Map<string, number>();
  const accepted = new Map<string, number>();
  const completed = new Map<string, number>();
  const cancelled = new Map<string, number>();
  for (const id of userIds) {
    offers.set(id, 0);
    accepted.set(id, 0);
    completed.set(id, 0);
    cancelled.set(id, 0);
  }
  if (userIds.length === 0) {
    return { offers, accepted, completed, cancelled };
  }

  const { data: offerRows } = await supabase
    .from("offers")
    .select("provider_id, status")
    .in("provider_id", userIds);

  for (const row of offerRows ?? []) {
    const id = row.provider_id as string;
    offers.set(id, (offers.get(id) ?? 0) + 1);
    if (row.status === "accepted") accepted.set(id, (accepted.get(id) ?? 0) + 1);
  }

  const acceptedIds = (offerRows ?? [])
    .filter((o) => o.status === "accepted")
    .map((o) => o.provider_id as string);

  if (acceptedIds.length > 0) {
    const uniqueProviders = [...new Set(acceptedIds)];
    const { data: reqs } = await supabase
      .from("offers")
      .select("provider_id, request:requests(status, trashed_at)")
      .in("provider_id", uniqueProviders)
      .eq("status", "accepted");

    for (const row of reqs ?? []) {
      const id = row.provider_id as string;
      const request = row.request as {
        status?: string;
        trashed_at?: string | null;
      } | null;
      if (!request || request.trashed_at) continue;
      if (request.status === "completed") completed.set(id, (completed.get(id) ?? 0) + 1);
      if (request.status === "cancelled") cancelled.set(id, (cancelled.get(id) ?? 0) + 1);
    }
  }

  return { offers, accepted, completed, cancelled };
}

export async function listAdminDirectory(
  supabase: SupabaseClient,
  adminClient: SupabaseClient | null,
  kind: AdminDirectoryKind,
  query: AdminListQuery
): Promise<AdminListResult> {
  const db = adminDataClient(supabase, adminClient);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = ADMIN_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const roles = rolesForKind(kind);
  const q = query.q?.trim() ?? "";

  let emailIds: string[] | null = null;
  if (q.includes("@")) {
    emailIds = await findProfileIdsByEmail(adminClient, q);
  }

  let builder = db
    .from("profiles")
    .select(
      "id, full_name, avatar_url, phone, city, country, role, phone_verified, created_at, updated_at, provider_category_slugs, rating, reviews_count, completed_orders_count, bio, skills, portfolio_items",
      { count: "exact" }
    )
    .in("role", roles)
    // Platform admins are not marketplace participants — exclude from both directories.
    .eq("is_platform_admin", false);

  if (query.city?.trim()) {
    builder = builder.ilike("city", `%${query.city.trim()}%`);
  }

  if (query.registeredFrom?.trim()) {
    builder = builder.gte("created_at", query.registeredFrom.trim());
  }
  if (query.registeredTo?.trim()) {
    builder = builder.lte("created_at", `${query.registeredTo.trim()}T23:59:59.999Z`);
  }

  if (kind === "providers" && query.category?.trim()) {
    builder = builder.contains("provider_category_slugs", [query.category.trim()]);
  }

  if (kind === "providers" && query.minRating != null && !Number.isNaN(query.minRating)) {
    builder = builder.gte("rating", query.minRating);
  }

  if (emailIds) {
    if (emailIds.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    builder = builder.in("id", emailIds);
  } else if (q) {
    builder = builder.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const sort = query.sort ?? "newest";
  if (sort === "oldest") {
    builder = builder.order("created_at", { ascending: true });
  } else if (sort === "rating" && kind === "providers") {
    builder = builder.order("rating", { ascending: false });
  } else if (sort === "activity") {
    builder = builder.order("updated_at", { ascending: false });
  } else {
    // newest / most_active default to newest registration; activity refined after aggregates
    builder = builder.order("created_at", { ascending: false });
  }

  const { data, error, count } = await builder.range(from, to);
  if (error) {
    throw new Error(error.message);
  }

  const profiles = (data ?? []) as ProfileRow[];
  const ids = profiles.map((p) => p.id);
  const emails = await mapEmails(adminClient, ids);

  const requestCounts =
    kind === "customers"
      ? await countRequestsByCustomer(db, ids)
      : {
          created: new Map<string, number>(),
          completed: new Map<string, number>(),
          cancelled: new Map<string, number>(),
        };

  const jobCounts =
    kind === "providers"
      ? await countJobsByProvider(db, ids)
      : {
          offers: new Map<string, number>(),
          accepted: new Map<string, number>(),
          completed: new Map<string, number>(),
          cancelled: new Map<string, number>(),
        };

  let balances = new Map<
    string,
    { available_balance: number; pending_payout: number; total_earned: number; currency: string }
  >();
  if (kind === "providers" && ids.length > 0) {
    const { data: balanceRows } = await db
      .from("provider_balances")
      .select("provider_id, available_balance, pending_payout, total_earned, currency")
      .in("provider_id", ids);
    balances = new Map(
      (balanceRows ?? []).map((b) => [
        b.provider_id as string,
        {
          available_balance: Number(b.available_balance ?? 0),
          pending_payout: Number(b.pending_payout ?? 0),
          total_earned: Number(b.total_earned ?? 0),
          currency: String(b.currency ?? "USD"),
        },
      ])
    );
  }

  let items: AdminUserListItem[] = profiles.map((p) => {
    const auth = emails.get(p.id) ?? { email: null, email_verified: null };
    const bal = balances.get(p.id);
    return {
      id: p.id,
      full_name: p.full_name || "—",
      avatar_url: p.avatar_url,
      email: auth.email,
      phone: p.phone,
      city: p.city,
      country: p.country,
      role: p.role,
      account_status: "active",
      email_verified: auth.email_verified,
      phone_verified: Boolean(p.phone_verified),
      created_at: p.created_at,
      last_activity_at: p.updated_at || p.created_at,
      provider_category_slugs: p.provider_category_slugs ?? [],
      rating: Number(p.rating ?? 0),
      reviews_count: Number(p.reviews_count ?? 0),
      completed_orders_count: Number(p.completed_orders_count ?? 0),
      requests_created: requestCounts.created.get(p.id) ?? 0,
      requests_completed: requestCounts.completed.get(p.id) ?? 0,
      requests_cancelled: requestCounts.cancelled.get(p.id) ?? 0,
      offers_submitted: jobCounts.offers.get(p.id) ?? 0,
      jobs_accepted: jobCounts.accepted.get(p.id) ?? 0,
      jobs_completed: jobCounts.completed.get(p.id) ?? 0,
      jobs_cancelled: jobCounts.cancelled.get(p.id) ?? 0,
      available_balance: bal?.available_balance ?? null,
      pending_payout: bal?.pending_payout ?? null,
      total_earned: bal?.total_earned ?? null,
      balance_currency: bal?.currency ?? null,
      disputes_count: 0,
      profile_complete: kind === "providers" ? isProfileComplete(p) : null,
    };
  });

  if (query.minOrders != null && !Number.isNaN(query.minOrders)) {
    const min = query.minOrders;
    items = items.filter((item) =>
      kind === "customers" ? item.requests_created >= min : item.jobs_completed >= min
    );
  }

  if (sort === "most_active") {
    items = [...items].sort((a, b) => {
      const av =
        kind === "customers" ? a.requests_created : a.jobs_completed + a.offers_submitted;
      const bv =
        kind === "customers" ? b.requests_created : b.jobs_completed + b.offers_submitted;
      return bv - av;
    });
  }

  if (sort === "completed" && kind === "providers") {
    items = [...items].sort((a, b) => b.jobs_completed - a.jobs_completed);
  }

  // status filter: only "active" exists in schema
  if (query.status && query.status !== "all" && query.status !== "active") {
    items = [];
  }

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
  };
}

export type AdminTimelineEvent = {
  id: string;
  at: string;
  kind: string;
  label: string;
  href?: string | null;
};

export type AdminCustomerRecord = {
  overview: AdminUserListItem;
  orders: Array<{
    id: string;
    title: string;
    category_name: string | null;
    budget_min: number | null;
    budget_max: number | null;
    order_amount: number | null;
    currency: string;
    location: string | null;
    created_at: string;
    status: RequestStatus;
    order_payment_status: OrderPaymentStatus | null;
    selected_provider_id: string | null;
    selected_provider_name: string | null;
    cancellation_reason: string | null;
  }>;
  offers: Array<{
    id: string;
    request_id: string;
    request_title: string | null;
    provider_id: string;
    provider_name: string | null;
    price: number;
    currency: string;
    status: OfferStatus;
    created_at: string;
    updated_at: string;
  }>;
  conversations: Array<{
    id: string;
    request_id: string;
    request_title: string | null;
    provider_id: string;
    provider_name: string | null;
    message_count: number;
    last_message_at: string | null;
  }>;
  payments: Array<{
    id: string;
    request_id: string;
    status: string;
    amount_gross: number;
    platform_fee: number;
    provider_amount: number;
    currency: string;
    payment_method: string | null;
    external_reference_prefix: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    request_id: string | null;
    reviewee_id: string;
    reviewee_name: string | null;
    created_at: string;
  }>;
  disputes: [];
  timeline: AdminTimelineEvent[];
};

export type AdminProviderRecord = {
  overview: AdminUserListItem;
  offers: Array<{
    id: string;
    request_id: string;
    request_title: string | null;
    customer_id: string;
    customer_name: string | null;
    price: number;
    currency: string;
    message: string;
    status: OfferStatus;
    created_at: string;
  }>;
  jobs: Array<{
    request_id: string;
    title: string;
    status: RequestStatus;
    agreed_amount: number | null;
    currency: string;
    customer_id: string;
    customer_name: string | null;
    created_at: string;
    work_submitted_at: string | null;
    completed_at: string | null;
    cancellation_reason: string | null;
  }>;
  work_submissions: Array<{
    id: string;
    request_id: string;
    request_title: string | null;
    summary: string;
    attachment_count: number;
    revision_number: number;
    created_at: string;
    request_status: RequestStatus | null;
  }>;
  conversations: Array<{
    id: string;
    request_id: string;
    request_title: string | null;
    customer_id: string;
    customer_name: string | null;
    message_count: number;
    last_message_at: string | null;
  }>;
  payments: Array<{
    id: string;
    request_id: string;
    status: string;
    amount_gross: number;
    platform_fee: number;
    provider_amount: number;
    currency: string;
    payment_method: string | null;
    external_reference_prefix: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    payment_method: string | null;
    processed_at: string | null;
    created_at: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    request_id: string | null;
    reviewer_id: string;
    reviewer_name: string | null;
    created_at: string;
  }>;
  disputes: [];
  timeline: AdminTimelineEvent[];
};

export async function getAdminCustomerRecord(
  supabase: SupabaseClient,
  adminClient: SupabaseClient | null,
  customerId: string
): Promise<AdminCustomerRecord | null> {
  const db = adminDataClient(supabase, adminClient);
  const { data: profile } = await db
    .from("profiles")
    .select(
      "id, full_name, avatar_url, phone, city, country, role, phone_verified, created_at, updated_at, provider_category_slugs, rating, reviews_count, completed_orders_count, bio, skills, portfolio_items, is_platform_admin"
    )
    .eq("id", customerId)
    .maybeSingle();

  if (!profile) return null;
  if (profile.is_platform_admin) return null;
  if (profile.role !== "customer" && profile.role !== "both") return null;

  const emails = await mapEmails(adminClient, [customerId]);
  const auth = emails.get(customerId) ?? { email: null, email_verified: null };
  const requestCounts = await countRequestsByCustomer(db, [customerId]);

  const overview: AdminUserListItem = {
    id: profile.id,
    full_name: profile.full_name || "—",
    avatar_url: profile.avatar_url,
    email: auth.email,
    phone: profile.phone,
    city: profile.city,
    country: profile.country,
    role: profile.role,
    account_status: "active",
    email_verified: auth.email_verified,
    phone_verified: Boolean(profile.phone_verified),
    created_at: profile.created_at,
    last_activity_at: profile.updated_at || profile.created_at,
    provider_category_slugs: profile.provider_category_slugs ?? [],
    rating: Number(profile.rating ?? 0),
    reviews_count: Number(profile.reviews_count ?? 0),
    completed_orders_count: Number(profile.completed_orders_count ?? 0),
    requests_created: requestCounts.created.get(customerId) ?? 0,
    requests_completed: requestCounts.completed.get(customerId) ?? 0,
    requests_cancelled: requestCounts.cancelled.get(customerId) ?? 0,
    offers_submitted: 0,
    jobs_accepted: 0,
    jobs_completed: 0,
    jobs_cancelled: 0,
    available_balance: null,
    pending_payout: null,
    total_earned: null,
    balance_currency: null,
    disputes_count: 0,
    profile_complete: null,
  };

  const { data: requests } = await db
    .from("requests")
    .select(
      "id, title, budget_min, budget_max, order_amount, currency, location, created_at, updated_at, status, order_payment_status, category:categories(name)"
    )
    .eq("customer_id", customerId)
    .is("trashed_at", null)
    .order("created_at", { ascending: false });

  const requestIds = (requests ?? []).map((r) => r.id as string);

  const { data: acceptedOffers } = requestIds.length
    ? await db
        .from("offers")
        .select("request_id, provider_id")
        .in("request_id", requestIds)
        .eq("status", "accepted")
    : { data: [] as Array<Record<string, unknown>> };

  const providerIds = [
    ...new Set((acceptedOffers ?? []).map((o) => o.provider_id as string).filter(Boolean)),
  ];
  const providerNames = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: providerRows } = await db
      .from("profiles")
      .select("id, full_name")
      .in("id", providerIds);
    for (const row of providerRows ?? []) {
      providerNames.set(row.id as string, (row.full_name as string) || "—");
    }
  }

  const acceptedByRequest = new Map(
    (acceptedOffers ?? []).map((o) => [
      o.request_id as string,
      {
        id: o.provider_id as string,
        name: providerNames.get(o.provider_id as string) ?? null,
      },
    ])
  );

  const orders = (requests ?? []).map((r) => {
    const selected = acceptedByRequest.get(r.id as string);
    return {
      id: r.id as string,
      title: r.title as string,
      category_name: (r.category as { name?: string } | null)?.name ?? null,
      budget_min: r.budget_min == null ? null : Number(r.budget_min),
      budget_max: r.budget_max == null ? null : Number(r.budget_max),
      order_amount: r.order_amount == null ? null : Number(r.order_amount),
      currency: String(r.currency ?? "USD"),
      location: (r.location as string | null) ?? null,
      created_at: r.created_at as string,
      status: r.status as RequestStatus,
      order_payment_status: (r.order_payment_status as OrderPaymentStatus | null) ?? null,
      selected_provider_id: selected?.id ?? null,
      selected_provider_name: selected?.name ?? null,
      cancellation_reason: null,
    };
  });

  const { data: offerRows } = requestIds.length
    ? await db
        .from("offers")
        .select(
          "id, request_id, provider_id, price, currency, status, created_at, updated_at, provider:profiles!offers_provider_id_fkey(full_name), request:requests(title)"
        )
        .in("request_id", requestIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  const offers = (offerRows ?? []).map((o) => ({
    id: o.id as string,
    request_id: o.request_id as string,
    request_title: (o.request as { title?: string } | null)?.title ?? null,
    provider_id: o.provider_id as string,
    provider_name: (o.provider as { full_name?: string } | null)?.full_name ?? null,
    price: Number(o.price),
    currency: String(o.currency ?? "USD"),
    status: o.status as OfferStatus,
    created_at: o.created_at as string,
    updated_at: o.updated_at as string,
  }));

  const { data: convRows } = await db
    .from("conversations")
    .select(
      "id, request_id, provider_id, last_message_at, provider:profiles!conversations_provider_id_fkey(full_name), request:requests(title)"
    )
    .eq("customer_id", customerId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  const convIds = (convRows ?? []).map((c) => c.id as string);
  const msgCount = new Map<string, number>();
  for (const id of convIds) msgCount.set(id, 0);
  if (convIds.length > 0) {
    const { data: msgs } = await db
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", convIds);
    for (const row of msgs ?? []) {
      const id = row.conversation_id as string;
      msgCount.set(id, (msgCount.get(id) ?? 0) + 1);
    }
  }

  const conversations = (convRows ?? []).map((c) => ({
    id: c.id as string,
    request_id: c.request_id as string,
    request_title: (c.request as { title?: string } | null)?.title ?? null,
    provider_id: c.provider_id as string,
    provider_name: (c.provider as { full_name?: string } | null)?.full_name ?? null,
    message_count: msgCount.get(c.id as string) ?? 0,
    last_message_at: (c.last_message_at as string | null) ?? null,
  }));

  const { data: paymentRows } = await db
    .from("payments")
    .select(
      "id, request_id, status, amount_gross, platform_fee, provider_amount, currency, payment_method, external_reference, paid_at, created_at"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  const payments = (paymentRows ?? []).map((p) => ({
    id: p.id as string,
    request_id: p.request_id as string,
    status: String(p.status),
    amount_gross: Number(p.amount_gross),
    platform_fee: Number(p.platform_fee),
    provider_amount: Number(p.provider_amount),
    currency: String(p.currency ?? "USD"),
    payment_method: (p.payment_method as string | null) ?? null,
    external_reference_prefix: safeStripePrefix(p.external_reference as string | null),
    paid_at: (p.paid_at as string | null) ?? null,
    created_at: p.created_at as string,
  }));

  const { data: reviewRows } = await db
    .from("reviews")
    .select(
      "id, rating, comment, request_id, reviewee_id, created_at, reviewee:profiles!reviews_reviewee_id_fkey(full_name)"
    )
    .eq("reviewer_id", customerId)
    .order("created_at", { ascending: false });

  const reviews = (reviewRows ?? []).map((r) => ({
    id: r.id as string,
    rating: Number(r.rating),
    comment: String(r.comment ?? ""),
    request_id: (r.request_id as string | null) ?? null,
    reviewee_id: r.reviewee_id as string,
    reviewee_name: (r.reviewee as { full_name?: string } | null)?.full_name ?? null,
    created_at: r.created_at as string,
  }));

  const timeline: AdminTimelineEvent[] = [];
  timeline.push({
    id: `reg-${customerId}`,
    at: overview.created_at,
    kind: "registration",
    label: "registration",
  });
  for (const o of orders) {
    timeline.push({
      id: `req-${o.id}`,
      at: o.created_at,
      kind: "request",
      label: o.title,
      href: `/requests/${o.id}`,
    });
  }
  for (const o of offers) {
    timeline.push({
      id: `offer-${o.id}`,
      at: o.created_at,
      kind: "offer",
      label: o.request_title ?? o.id,
      href: `/requests/${o.request_id}`,
    });
  }
  for (const p of payments) {
    timeline.push({
      id: `pay-${p.id}`,
      at: p.paid_at ?? p.created_at,
      kind: "payment",
      label: p.status,
      href: `/requests/${p.request_id}/payment`,
    });
  }
  for (const r of reviews) {
    timeline.push({
      id: `rev-${r.id}`,
      at: r.created_at,
      kind: "review",
      label: `★ ${r.rating}`,
      href: r.request_id ? `/requests/${r.request_id}` : null,
    });
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  const lastActivity = [
    overview.created_at,
    overview.last_activity_at,
    ...orders.map((o) => o.created_at),
    ...payments.map((p) => p.paid_at ?? p.created_at),
    ...conversations.map((c) => c.last_message_at).filter(Boolean) as string[],
  ].sort()
    .at(-1);
  if (lastActivity) overview.last_activity_at = lastActivity;

  return {
    overview,
    orders,
    offers,
    conversations,
    payments,
    reviews,
    disputes: [],
    timeline,
  };
}

export async function getAdminProviderRecord(
  supabase: SupabaseClient,
  adminClient: SupabaseClient | null,
  providerId: string
): Promise<AdminProviderRecord | null> {
  const db = adminDataClient(supabase, adminClient);
  const { data: profile } = await db
    .from("profiles")
    .select(
      "id, full_name, avatar_url, phone, city, country, role, phone_verified, created_at, updated_at, provider_category_slugs, rating, reviews_count, completed_orders_count, bio, skills, portfolio_items, is_platform_admin"
    )
    .eq("id", providerId)
    .maybeSingle();

  if (!profile) return null;
  if (profile.is_platform_admin) return null;
  if (profile.role !== "provider" && profile.role !== "both") return null;

  const emails = await mapEmails(adminClient, [providerId]);
  const auth = emails.get(providerId) ?? { email: null, email_verified: null };
  const jobCounts = await countJobsByProvider(db, [providerId]);

  const { data: balance } = await db
    .from("provider_balances")
    .select("available_balance, pending_payout, total_earned, currency")
    .eq("provider_id", providerId)
    .maybeSingle();

  const overview: AdminUserListItem = {
    id: profile.id,
    full_name: profile.full_name || "—",
    avatar_url: profile.avatar_url,
    email: auth.email,
    phone: profile.phone,
    city: profile.city,
    country: profile.country,
    role: profile.role,
    account_status: "active",
    email_verified: auth.email_verified,
    phone_verified: Boolean(profile.phone_verified),
    created_at: profile.created_at,
    last_activity_at: profile.updated_at || profile.created_at,
    provider_category_slugs: profile.provider_category_slugs ?? [],
    rating: Number(profile.rating ?? 0),
    reviews_count: Number(profile.reviews_count ?? 0),
    completed_orders_count: Number(profile.completed_orders_count ?? 0),
    requests_created: 0,
    requests_completed: 0,
    requests_cancelled: 0,
    offers_submitted: jobCounts.offers.get(providerId) ?? 0,
    jobs_accepted: jobCounts.accepted.get(providerId) ?? 0,
    jobs_completed: jobCounts.completed.get(providerId) ?? 0,
    jobs_cancelled: jobCounts.cancelled.get(providerId) ?? 0,
    profile_complete: isProfileComplete(profile as ProfileRow),
    available_balance: balance ? Number(balance.available_balance ?? 0) : 0,
    pending_payout: balance ? Number(balance.pending_payout ?? 0) : 0,
    total_earned: balance ? Number(balance.total_earned ?? 0) : 0,
    balance_currency: balance ? String(balance.currency ?? "USD") : "USD",
    disputes_count: 0,
  };

  const { data: offerRows } = await db
    .from("offers")
    .select(
      "id, request_id, price, currency, message, status, created_at, request:requests(title, customer_id, customer:profiles!requests_customer_id_fkey(full_name))"
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const offers = (offerRows ?? []).map((o) => {
    const request = o.request as {
      title?: string;
      customer_id?: string;
      customer?: { full_name?: string } | null;
    } | null;
    return {
      id: o.id as string,
      request_id: o.request_id as string,
      request_title: request?.title ?? null,
      customer_id: request?.customer_id ?? "",
      customer_name: request?.customer?.full_name ?? null,
      price: Number(o.price),
      currency: String(o.currency ?? "USD"),
      message: String(o.message ?? ""),
      status: o.status as OfferStatus,
      created_at: o.created_at as string,
    };
  });

  const acceptedOfferRequestIds = offers
    .filter((o) => o.status === "accepted")
    .map((o) => o.request_id);

  const { data: jobRows } = acceptedOfferRequestIds.length
    ? await db
        .from("requests")
        .select(
          "id, title, status, order_amount, currency, customer_id, created_at, updated_at, work_submitted_at, customer:profiles!requests_customer_id_fkey(full_name)"
        )
        .in("id", acceptedOfferRequestIds)
        .is("trashed_at", null)
        .order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  const jobs = (jobRows ?? []).map((r) => ({
    request_id: r.id as string,
    title: r.title as string,
    status: r.status as RequestStatus,
    agreed_amount: r.order_amount == null ? null : Number(r.order_amount),
    currency: String(r.currency ?? "USD"),
    customer_id: r.customer_id as string,
    customer_name: (r.customer as { full_name?: string } | null)?.full_name ?? null,
    created_at: r.created_at as string,
    work_submitted_at: (r.work_submitted_at as string | null) ?? null,
    completed_at: r.status === "completed" ? (r.updated_at as string) : null,
    cancellation_reason: null,
  }));

  const { data: submissionRows } = await db
    .from("work_submissions")
    .select(
      "id, request_id, summary, attachments, revision_number, created_at, request:requests(title, status)"
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const work_submissions = (submissionRows ?? []).map((s) => {
    const attachments = s.attachments;
    const attachment_count = Array.isArray(attachments) ? attachments.length : 0;
    const request = s.request as { title?: string; status?: RequestStatus } | null;
    return {
      id: s.id as string,
      request_id: s.request_id as string,
      request_title: request?.title ?? null,
      summary: String(s.summary ?? ""),
      attachment_count,
      revision_number: Number(s.revision_number ?? 1),
      created_at: s.created_at as string,
      request_status: request?.status ?? null,
    };
  });

  const { data: convRows } = await db
    .from("conversations")
    .select(
      "id, request_id, customer_id, last_message_at, customer:profiles!conversations_customer_id_fkey(full_name), request:requests(title)"
    )
    .eq("provider_id", providerId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  const convIds = (convRows ?? []).map((c) => c.id as string);
  const msgCount = new Map<string, number>();
  for (const id of convIds) msgCount.set(id, 0);
  if (convIds.length > 0) {
    const { data: msgs } = await db
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", convIds);
    for (const row of msgs ?? []) {
      const id = row.conversation_id as string;
      msgCount.set(id, (msgCount.get(id) ?? 0) + 1);
    }
  }

  const conversations = (convRows ?? []).map((c) => ({
    id: c.id as string,
    request_id: c.request_id as string,
    request_title: (c.request as { title?: string } | null)?.title ?? null,
    customer_id: c.customer_id as string,
    customer_name: (c.customer as { full_name?: string } | null)?.full_name ?? null,
    message_count: msgCount.get(c.id as string) ?? 0,
    last_message_at: (c.last_message_at as string | null) ?? null,
  }));

  const { data: paymentRows } = await db
    .from("payments")
    .select(
      "id, request_id, status, amount_gross, platform_fee, provider_amount, currency, payment_method, external_reference, paid_at, created_at"
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const payments = (paymentRows ?? []).map((p) => ({
    id: p.id as string,
    request_id: p.request_id as string,
    status: String(p.status),
    amount_gross: Number(p.amount_gross),
    platform_fee: Number(p.platform_fee),
    provider_amount: Number(p.provider_amount),
    currency: String(p.currency ?? "USD"),
    payment_method: (p.payment_method as string | null) ?? null,
    external_reference_prefix: safeStripePrefix(p.external_reference as string | null),
    paid_at: (p.paid_at as string | null) ?? null,
    created_at: p.created_at as string,
  }));

  const { data: payoutRows } = await db
    .from("payouts")
    .select("id, amount, currency, status, payment_method, processed_at, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const payouts = (payoutRows ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount),
    currency: String(p.currency ?? "USD"),
    status: String(p.status),
    payment_method: (p.payment_method as string | null) ?? null,
    processed_at: (p.processed_at as string | null) ?? null,
    created_at: p.created_at as string,
  }));

  const { data: reviewRows } = await db
    .from("reviews")
    .select(
      "id, rating, comment, request_id, reviewer_id, created_at, reviewer:profiles!reviews_reviewer_id_fkey(full_name)"
    )
    .eq("reviewee_id", providerId)
    .order("created_at", { ascending: false });

  const reviews = (reviewRows ?? []).map((r) => ({
    id: r.id as string,
    rating: Number(r.rating),
    comment: String(r.comment ?? ""),
    request_id: (r.request_id as string | null) ?? null,
    reviewer_id: r.reviewer_id as string,
    reviewer_name: (r.reviewer as { full_name?: string } | null)?.full_name ?? null,
    created_at: r.created_at as string,
  }));

  const timeline: AdminTimelineEvent[] = [];
  timeline.push({
    id: `reg-${providerId}`,
    at: overview.created_at,
    kind: "registration",
    label: "registration",
  });
  for (const o of offers) {
    timeline.push({
      id: `offer-${o.id}`,
      at: o.created_at,
      kind: "offer",
      label: o.request_title ?? o.id,
      href: `/requests/${o.request_id}`,
    });
  }
  for (const j of jobs) {
    timeline.push({
      id: `job-${j.request_id}`,
      at: j.created_at,
      kind: "job",
      label: j.title,
      href: `/requests/${j.request_id}`,
    });
  }
  for (const s of work_submissions) {
    timeline.push({
      id: `work-${s.id}`,
      at: s.created_at,
      kind: "work_submission",
      label: s.request_title ?? s.id,
      href: `/requests/${s.request_id}`,
    });
  }
  for (const p of payments) {
    timeline.push({
      id: `pay-${p.id}`,
      at: p.paid_at ?? p.created_at,
      kind: "payment",
      label: p.status,
      href: `/requests/${p.request_id}/payment`,
    });
  }
  for (const r of reviews) {
    timeline.push({
      id: `rev-${r.id}`,
      at: r.created_at,
      kind: "review",
      label: `★ ${r.rating}`,
      href: r.request_id ? `/requests/${r.request_id}` : null,
    });
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  const lastActivity = [
    overview.last_activity_at,
    ...offers.map((o) => o.created_at),
    ...payments.map((p) => p.paid_at ?? p.created_at),
    ...conversations.map((c) => c.last_message_at).filter(Boolean) as string[],
  ]
    .sort()
    .at(-1);
  if (lastActivity) overview.last_activity_at = lastActivity;

  return {
    overview,
    offers,
    jobs,
    work_submissions,
    conversations,
    payments,
    payouts,
    reviews,
    disputes: [],
    timeline,
  };
}

export type AdminConversationRecord = {
  id: string;
  request_id: string;
  request_title: string | null;
  customer_id: string;
  customer_name: string | null;
  provider_id: string;
  provider_name: string | null;
  last_message_at: string | null;
  messages: Array<{
    id: string;
    sender_id: string;
    sender_name: string | null;
    content: string;
    created_at: string;
  }>;
};

export async function getAdminConversationRecord(
  supabase: SupabaseClient,
  adminClient: SupabaseClient | null,
  conversationId: string
): Promise<AdminConversationRecord | null> {
  const db = adminDataClient(supabase, adminClient);
  const { data: conv } = await db
    .from("conversations")
    .select(
      "id, request_id, customer_id, provider_id, last_message_at, customer:profiles!conversations_customer_id_fkey(full_name), provider:profiles!conversations_provider_id_fkey(full_name), request:requests(title)"
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return null;

  const { data: messageRows } = await db
    .from("messages")
    .select("id, sender_id, content, created_at, sender:profiles!messages_sender_id_fkey(full_name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return {
    id: conv.id as string,
    request_id: conv.request_id as string,
    request_title: (conv.request as { title?: string } | null)?.title ?? null,
    customer_id: conv.customer_id as string,
    customer_name: (conv.customer as { full_name?: string } | null)?.full_name ?? null,
    provider_id: conv.provider_id as string,
    provider_name: (conv.provider as { full_name?: string } | null)?.full_name ?? null,
    last_message_at: (conv.last_message_at as string | null) ?? null,
    messages: (messageRows ?? []).map((m) => ({
      id: m.id as string,
      sender_id: m.sender_id as string,
      sender_name: (m.sender as { full_name?: string } | null)?.full_name ?? null,
      content: String(m.content ?? ""),
      created_at: m.created_at as string,
    })),
  };
}
