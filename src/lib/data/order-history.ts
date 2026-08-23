import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ORDER_HISTORY_PAGE_SIZE,
  resolveHistoryLabel,
  type OrderHistoryFilters,
  type OrderHistoryItem,
  type OrderHistorySort,
  type OrderHistoryTab,
} from "@/lib/orders/history-types";
import type {
  OfferStatus,
  OrderPaymentStatus,
  OrderPayoutStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";

type RawRequest = Record<string, unknown>;

export type OrderHistoryListResult = {
  items: OrderHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isMissingArchiveColumnError(message: string): boolean {
  return /archived_at|trashed_at/i.test(message);
}

type TabSortableQuery = {
  not: (column: string, operator: string, value: unknown) => TabSortableQuery;
  is: (column: string, value: null) => TabSortableQuery;
  in: (column: string, values: string[]) => TabSortableQuery;
  eq: (column: string, value: string) => TabSortableQuery;
  or: (filters: string) => TabSortableQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ) => TabSortableQuery;
};

/**
 * Tab filters.
 * - archived: only archived, never trashed
 * - all: every non-trashed order (active/completed/cancelled/refunded/disputed/archived)
 * - other tabs: non-trashed, non-archived, then status group
 *
 * When `archiveColumnsAvailable` is false (legacy DB), skip archive/trash SQL filters.
 */
function applyTabFilter<T extends TabSortableQuery>(
  query: T,
  tab: OrderHistoryTab | undefined,
  archiveColumnsAvailable: boolean
): T {
  const t = tab ?? "all";

  if (!archiveColumnsAvailable) {
    if (t === "archived") {
      // Cannot express archived without columns — return empty via impossible filter.
      return query.eq("id", "00000000-0000-0000-0000-000000000000") as T;
    }
    if (t === "active") {
      return query.in("status", ["open", "in_progress", "pending_review"]) as T;
    }
    if (t === "completed") return query.eq("status", "completed") as T;
    if (t === "cancelled_refunded") {
      return query.or(
        "status.eq.cancelled,order_payment_status.eq.refunded,refund_dispute_status.eq.refunded"
      ) as T;
    }
    if (t === "disputed") {
      return query.eq("refund_dispute_status", "dispute_opened") as T;
    }
    return query;
  }

  if (t === "archived") {
    return query.not("archived_at", "is", null).is("trashed_at", null) as T;
  }

  // All + status tabs: never show trashed.
  let next = query.is("trashed_at", null) as T;
  if (t === "all") {
    // All = active + completed + cancelled/refunded + disputed (+ archived if not trashed).
    return next;
  }

  // Non-All status tabs hide archived rows (they live under Archived).
  next = next.is("archived_at", null) as T;
  if (t === "active") {
    return next.in("status", ["open", "in_progress", "pending_review"]) as T;
  }
  if (t === "completed") {
    return next.eq("status", "completed") as T;
  }
  if (t === "cancelled_refunded") {
    return next.or(
      "status.eq.cancelled,order_payment_status.eq.refunded,refund_dispute_status.eq.refunded"
    ) as T;
  }
  if (t === "disputed") {
    return next.eq("refund_dispute_status", "dispute_opened") as T;
  }
  return next;
}

function applySort<T extends TabSortableQuery>(
  query: T,
  sort: OrderHistorySort | undefined
): T {
  switch (sort) {
    case "oldest":
      return query.order("created_at", { ascending: true }) as T;
    case "amount_desc":
      return query
        .order("order_amount", { ascending: false, nullsFirst: false })
        .order("budget_max", { ascending: false, nullsFirst: false }) as T;
    case "amount_asc":
      return query
        .order("order_amount", { ascending: true, nullsFirst: false })
        .order("budget_max", { ascending: true, nullsFirst: false }) as T;
    case "status":
      return query
        .order("status", { ascending: true })
        .order("created_at", { ascending: false }) as T;
    case "activity":
      return query.order("updated_at", { ascending: false }) as T;
    case "newest":
    default:
      return query.order("created_at", { ascending: false }) as T;
  }
}

function mapItem(
  row: RawRequest,
  extras: {
    providerId?: string | null;
    providerName?: string | null;
    offerId?: string | null;
    offerStatus?: OfferStatus | null;
    acceptedAt?: string | null;
    conversationId?: string | null;
    disputeId?: string | null;
    reviewStatus?: OrderHistoryItem["review_status"];
    isTest?: boolean;
  } = {}
): OrderHistoryItem {
  const customer = (row.customer ?? {}) as Record<string, unknown>;
  const category = (row.category ?? {}) as Record<string, unknown>;
  const status = (row.status as RequestStatus) ?? "open";
  const orderPaymentStatus =
    (row.order_payment_status as OrderPaymentStatus) ?? null;
  const refundDisputeStatus =
    (row.refund_dispute_status as RefundDisputeStatus) ?? null;
  const agreed =
    num(row.order_amount) ??
    num(extras.offerStatus === "accepted" ? row._offer_price : null) ??
    num(row.budget_max);

  const hasRevision = Boolean(
    typeof row.revision_feedback === "string" &&
      row.revision_feedback.trim().length > 0
  );

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status,
    history_label: resolveHistoryLabel({
      status,
      orderPaymentStatus,
      refundDisputeStatus,
      offerStatus: extras.offerStatus,
      hasRevision,
      archivedAt: (row.archived_at as string) ?? null,
    }),
    category_id: (row.category_id as string) ?? null,
    category_name: (category.name as string) ?? null,
    location: (row.location as string) ?? null,
    currency: String(row.currency ?? "USD"),
    budget_max: num(row.budget_max),
    agreed_amount: agreed,
    order_payment_status: orderPaymentStatus,
    refund_dispute_status: refundDisputeStatus,
    payout_status: (row.payout_status as OrderPayoutStatus) ?? null,
    customer_id: String(row.customer_id ?? ""),
    customer_name: (customer.full_name as string) ?? null,
    provider_id: extras.providerId ?? null,
    provider_name: extras.providerName ?? null,
    offer_id: extras.offerId ?? null,
    offer_status: extras.offerStatus ?? null,
    conversation_id: extras.conversationId ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
    accepted_at: extras.acceptedAt ?? null,
    paid_at: (row.paid_at as string) ?? null,
    work_submitted_at: (row.work_submitted_at as string) ?? null,
    completed_at:
      status === "completed" ? String(row.updated_at ?? row.created_at) : null,
    cancelled_at:
      status === "cancelled" ? String(row.updated_at ?? row.created_at) : null,
    refunded_at: (row.refunded_at as string) ?? null,
    archived_at: (row.archived_at as string) ?? null,
    trashed_at: (row.trashed_at as string) ?? null,
    has_revision: hasRevision,
    review_status: extras.reviewStatus ?? "none",
    is_test: Boolean(extras.isTest),
    dispute_id: extras.disputeId ?? null,
  };
}

async function enrichOrders(
  supabase: SupabaseClient,
  items: OrderHistoryItem[]
): Promise<OrderHistoryItem[]> {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);

  const [
    { data: acceptedOffers },
    { data: conversations },
    { data: disputes },
    { data: reviews },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("offers")
      .select(
        "id, request_id, provider_id, price, status, updated_at, provider:profiles(id, full_name)"
      )
      .in("request_id", ids)
      .eq("status", "accepted"),
    supabase
      .from("conversations")
      .select("id, request_id, provider_id")
      .in("request_id", ids),
    supabase
      .from("order_disputes")
      .select("id, request_id, status")
      .in("request_id", ids)
      .eq("status", "opened"),
    supabase
      .from("reviews")
      .select("id, request_id, reviewer_id, reviewee_id")
      .in("request_id", ids),
    supabase
      .from("payments")
      .select("request_id, payment_method, amount_gross")
      .in("request_id", ids),
  ]);

  const offerByRequest = new Map(
    (acceptedOffers ?? []).map((o) => [o.request_id as string, o])
  );
  const convByRequest = new Map(
    (conversations ?? []).map((c) => [c.request_id as string, c])
  );
  const disputeByRequest = new Map(
    (disputes ?? []).map((d) => [d.request_id as string, d])
  );
  const paymentByRequest = new Map(
    (payments ?? []).map((p) => [p.request_id as string, p])
  );
  const reviewsByRequest = new Map<string, Array<{ reviewer_id: string }>>();
  for (const r of reviews ?? []) {
    const rid = r.request_id as string;
    if (!rid) continue;
    const list = reviewsByRequest.get(rid) ?? [];
    list.push({ reviewer_id: r.reviewer_id as string });
    reviewsByRequest.set(rid, list);
  }

  return items.map((item) => {
    const offer = offerByRequest.get(item.id) as
      | {
          id: string;
          provider_id: string;
          price: number;
          updated_at: string;
          provider?: { full_name?: string } | null;
        }
      | undefined;
    const conv = convByRequest.get(item.id);
    const dispute = disputeByRequest.get(item.id);
    const payment = paymentByRequest.get(item.id) as
      | { payment_method?: string; amount_gross?: number }
      | undefined;
    const revs = reviewsByRequest.get(item.id) ?? [];

    let reviewStatus: OrderHistoryItem["review_status"] = "none";
    if (revs.length >= 2) reviewStatus = "both";
    else if (revs.length === 1) {
      if (revs[0].reviewer_id === item.customer_id) reviewStatus = "left";
      else reviewStatus = "received";
    }

    const providerId = item.provider_id ?? offer?.provider_id ?? null;
    const providerName =
      item.provider_name ?? offer?.provider?.full_name ?? null;
    const agreed =
      item.agreed_amount ??
      (offer?.price != null ? Number(offer.price) : null) ??
      (payment?.amount_gross != null ? Number(payment.amount_gross) : null);

    const method = String(payment?.payment_method ?? "");
    const isTest =
      item.is_test ||
      method === "test" ||
      method.startsWith("test") ||
      method.startsWith("look_test");

    // Prefer conversation matching assigned provider when available.
    let conversationId = item.conversation_id;
    if (!conversationId && conv) {
      conversationId = conv.id as string;
    }
    if (providerId && conversations?.length) {
      const match = conversations.find(
        (c) =>
          c.request_id === item.id &&
          (c.provider_id === providerId || !providerId)
      );
      if (match) conversationId = match.id as string;
    }

    return {
      ...item,
      provider_id: providerId,
      provider_name: providerName,
      offer_id: item.offer_id ?? offer?.id ?? null,
      offer_status: item.offer_status ?? (offer ? "accepted" : null),
      accepted_at: item.accepted_at ?? offer?.updated_at ?? null,
      conversation_id: conversationId ?? null,
      dispute_id: item.dispute_id ?? (dispute?.id as string) ?? null,
      agreed_amount: agreed,
      review_status: reviewStatus,
      is_test: isTest,
      history_label: resolveHistoryLabel({
        status: item.status,
        orderPaymentStatus: item.order_payment_status,
        refundDisputeStatus: item.refund_dispute_status,
        offerStatus: item.offer_status ?? (offer ? "accepted" : null),
        hasRevision: item.has_revision,
        archivedAt: item.archived_at,
      }),
    };
  });
}

/** Same join style as /my/requests (works for legacy + new schemas). */
function baseRequestSelect(includeArchiveColumns: boolean) {
  const archiveCols = includeArchiveColumns
    ? "archived_at, trashed_at, "
    : "";
  return `id, customer_id, category_id, title, description, budget_max, currency, location,
    status, revision_feedback, work_submitted_at, order_payment_status, order_amount,
    payout_status, paid_at, refund_dispute_status, refunded_at, cancellation_reason,
    ${archiveCols}created_at, updated_at,
    customer:profiles!requests_customer_id_fkey(id, full_name, avatar_url),
    category:categories(id, name, slug)`;
}

function pageParams(filters: OrderHistoryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? ORDER_HISTORY_PAGE_SIZE, 1),
    50
  );
  return { page, pageSize, from: (page - 1) * pageSize, to: (page - 1) * pageSize + pageSize - 1 };
}

function applyCommonFilters<T extends {
  eq: (column: string, value: string) => T;
  ilike: (column: string, pattern: string) => T;
  gte: (column: string, value: string | number) => T;
  lte: (column: string, value: string | number) => T;
  or: (filters: string) => T;
}>(query: T, filters: OrderHistoryFilters, opts?: { includeLocationInQ?: boolean }): T {
  let next = query;
  if (filters.status && filters.status !== "all") {
    next = next.eq("status", filters.status);
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    next = next.eq("order_payment_status", filters.paymentStatus);
  }
  if (filters.refundDisputeStatus && filters.refundDisputeStatus !== "all") {
    next = next.eq("refund_dispute_status", filters.refundDisputeStatus);
  }
  if (filters.categoryId) next = next.eq("category_id", filters.categoryId);
  if (filters.location?.trim()) {
    next = next.ilike("location", `%${filters.location.trim()}%`);
  }
  if (filters.from) next = next.gte("created_at", filters.from);
  if (filters.to) next = next.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRe.test(q)) {
      next = next.or(`title.ilike.%${q}%,id.eq.${q}`);
    } else if (opts?.includeLocationInQ) {
      next = next.or(`title.ilike.%${q}%,location.ilike.%${q}%`);
    } else {
      next = next.ilike("title", `%${q}%`);
    }
  }
  if (filters.amountMin != null) {
    next = next.gte("order_amount", filters.amountMin);
  }
  if (filters.amountMax != null) {
    next = next.lte("order_amount", filters.amountMax);
  }
  return next;
}

function matchesProviderTab(
  item: OrderHistoryItem,
  filters: OrderHistoryFilters
): boolean {
  if (item.trashed_at) return false;
  const tab = filters.tab ?? "all";
  if (tab === "archived") return Boolean(item.archived_at);
  if (tab !== "all" && item.archived_at) return false;
  if (tab === "active") {
    return ["open", "in_progress", "pending_review"].includes(item.status);
  }
  if (tab === "completed") return item.status === "completed";
  if (tab === "cancelled_refunded") {
    return (
      item.status === "cancelled" ||
      item.order_payment_status === "refunded" ||
      item.refund_dispute_status === "refunded"
    );
  }
  if (tab === "disputed") {
    return item.refund_dispute_status === "dispute_opened";
  }
  if (filters.status && filters.status !== "all" && item.status !== filters.status) {
    return false;
  }
  if (
    filters.paymentStatus &&
    filters.paymentStatus !== "all" &&
    item.order_payment_status !== filters.paymentStatus
  ) {
    return false;
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    if (!item.title.toLowerCase().includes(q) && item.id.toLowerCase() !== q) {
      return false;
    }
  }
  return true;
}

async function runCustomerQuery(
  supabase: SupabaseClient,
  customerId: string,
  filters: OrderHistoryFilters,
  includeArchiveColumns: boolean
) {
  const { page, pageSize, from, to } = pageParams(filters);

  let query = supabase
    .from("requests")
    .select(baseRequestSelect(includeArchiveColumns), { count: "exact" })
    .eq("customer_id", customerId);

  query = applyTabFilter(query, filters.tab, includeArchiveColumns);
  query = applyCommonFilters(query, filters);
  query = applySort(query, filters.sort).range(from, to);

  return { ...(await query), page, pageSize };
}

export async function listCustomerOrderHistory(
  supabase: SupabaseClient,
  customerId: string,
  filters: OrderHistoryFilters = {}
): Promise<OrderHistoryListResult> {
  const { page, pageSize } = pageParams(filters);

  let result = await runCustomerQuery(supabase, customerId, filters, true);
  if (result.error && isMissingArchiveColumnError(result.error.message)) {
    console.warn(
      "[order-history] archive columns missing; retrying legacy customer query"
    );
    result = await runCustomerQuery(supabase, customerId, filters, false);
  }

  if (result.error) {
    console.error("[order-history] customer list failed", result.error.message);
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      error: result.error.message,
    };
  }

  const mapped = ((result.data ?? []) as unknown as RawRequest[]).map((row) =>
    mapItem(row)
  );
  const items = await enrichOrders(supabase, mapped);
  return {
    items,
    total: result.count ?? items.length,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function listProviderOrderHistory(
  supabase: SupabaseClient,
  providerId: string,
  filters: OrderHistoryFilters = {}
): Promise<OrderHistoryListResult> {
  const { page, pageSize, from, to } = pageParams(filters);

  // Connected via any offer (pending/accepted/rejected) = assignment path.
  let offerQuery = supabase
    .from("offers")
    .select(
      "id, request_id, provider_id, price, status, created_at, updated_at",
      { count: "exact" }
    )
    .eq("provider_id", providerId);

  if (filters.offerStatus && filters.offerStatus !== "all") {
    offerQuery = offerQuery.eq("status", filters.offerStatus);
  }

  offerQuery = offerQuery
    .order("updated_at", { ascending: filters.sort === "oldest" })
    .range(from, to);

  const { data: offers, error, count } = await offerQuery;
  if (error) {
    console.error("[order-history] provider list failed", error.message);
    return { items: [], total: 0, page, pageSize, error: error.message };
  }

  const offerRows = (offers ?? []) as Array<{
    id: string;
    request_id: string;
    provider_id: string;
    price: number;
    status: OfferStatus;
    created_at: string;
    updated_at: string;
  }>;

  const requestIds = [...new Set(offerRows.map((o) => o.request_id))];
  if (!requestIds.length) {
    return { items: [], total: count ?? 0, page, pageSize };
  }

  const loadRequests = async (includeArchiveColumns: boolean) =>
    supabase
      .from("requests")
      .select(baseRequestSelect(includeArchiveColumns))
      .in("id", requestIds);

  let reqResult = await loadRequests(true);
  if (
    reqResult.error &&
    isMissingArchiveColumnError(reqResult.error.message)
  ) {
    console.warn(
      "[order-history] archive columns missing; retrying legacy provider query"
    );
    reqResult = await loadRequests(false);
  }

  if (reqResult.error) {
    console.error(
      "[order-history] provider requests failed",
      reqResult.error.message
    );
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      error: reqResult.error.message,
    };
  }

  const requestById = new Map(
    ((reqResult.data ?? []) as unknown as RawRequest[]).map((r) => [
      String(r.id),
      r,
    ])
  );

  let mapped = offerRows
    .map((offer) => {
      const request = requestById.get(offer.request_id);
      if (!request) return null;
      const item = mapItem(request, {
        providerId,
        offerId: offer.id,
        offerStatus: offer.status,
        acceptedAt: offer.status === "accepted" ? offer.updated_at : null,
      });
      return {
        ...item,
        agreed_amount: item.agreed_amount ?? num(offer.price),
      };
    })
    .filter((x): x is OrderHistoryItem => Boolean(x));

  mapped = mapped.filter((item) => matchesProviderTab(item, filters));

  const items = await enrichOrders(supabase, mapped);
  return { items, total: count ?? items.length, page, pageSize };
}

async function runAdminQuery(
  admin: SupabaseClient,
  filters: OrderHistoryFilters,
  includeArchiveColumns: boolean,
  requestIds?: string[] | null
) {
  const { page, pageSize, from, to } = pageParams(filters);

  let query = admin
    .from("requests")
    .select(baseRequestSelect(includeArchiveColumns), { count: "exact" });

  query = applyTabFilter(query, filters.tab, includeArchiveColumns);

  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (requestIds) {
    if (!requestIds.length) {
      return {
        data: [],
        error: null,
        count: 0,
        page,
        pageSize,
      };
    }
    query = query.in("id", requestIds);
  }

  query = applyCommonFilters(query, filters, { includeLocationInQ: true });

  query = applySort(query, filters.sort).range(from, to);
  return { ...(await query), page, pageSize };
}

export async function listAdminOrderHistory(
  admin: SupabaseClient,
  filters: OrderHistoryFilters = {}
): Promise<OrderHistoryListResult> {
  const { page, pageSize } = pageParams(filters);

  let providerRequestIds: string[] | null = null;
  if (filters.providerId) {
    const { data: offers } = await admin
      .from("offers")
      .select("request_id")
      .eq("provider_id", filters.providerId);
    providerRequestIds = [
      ...new Set((offers ?? []).map((o) => o.request_id as string)),
    ];
    if (!providerRequestIds.length) {
      return { items: [], total: 0, page, pageSize };
    }
  }

  let result = await runAdminQuery(admin, filters, true, providerRequestIds);
  if (result.error && isMissingArchiveColumnError(result.error.message)) {
    console.warn(
      "[order-history] archive columns missing; retrying legacy admin query"
    );
    result = await runAdminQuery(admin, filters, false, providerRequestIds);
  }

  if (result.error) {
    console.error("[order-history] admin list failed", result.error.message);
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      error: result.error.message,
    };
  }

  let items = await enrichOrders(
    admin,
    ((result.data ?? []) as unknown as RawRequest[]).map((row) => mapItem(row))
  );

  if (filters.testOnly === true) {
    items = items.filter((i) => i.is_test);
  } else if (filters.testOnly === false) {
    items = items.filter((i) => !i.is_test);
  }

  return {
    items,
    total: result.count ?? items.length,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function setRequestArchived(
  supabase: SupabaseClient,
  requestId: string,
  archived: boolean
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("requests")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export function orderHistoryToCsv(items: OrderHistoryItem[]): string {
  const headers = [
    "id",
    "title",
    "status",
    "history_label",
    "category",
    "location",
    "customer_id",
    "customer_name",
    "provider_id",
    "provider_name",
    "agreed_amount",
    "currency",
    "order_payment_status",
    "refund_dispute_status",
    "payout_status",
    "created_at",
    "paid_at",
    "work_submitted_at",
    "refunded_at",
    "archived_at",
    "is_test",
    "review_status",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const item of items) {
    lines.push(
      [
        item.id,
        item.title,
        item.status,
        item.history_label,
        item.category_name,
        item.location,
        item.customer_id,
        item.customer_name,
        item.provider_id,
        item.provider_name,
        item.agreed_amount,
        item.currency,
        item.order_payment_status,
        item.refund_dispute_status,
        item.payout_status,
        item.created_at,
        item.paid_at,
        item.work_submitted_at,
        item.refunded_at,
        item.archived_at,
        item.is_test,
        item.review_status,
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}
