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

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function applyTabFilter<T extends TabSortableQuery>(
  query: T,
  tab: OrderHistoryTab | undefined
): T {
  const t = tab ?? "all";
  if (t === "archived") {
    return query.not("archived_at", "is", null).is("trashed_at", null) as T;
  }
  // Normal tabs exclude trashed and archived rows (except "all").
  let next = query.is("trashed_at", null) as T;
  if (t === "all") return next;
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
      .select("id, request_id, provider_id, price, status, updated_at, provider:profiles(id, full_name)")
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

    return {
      ...item,
      provider_id: providerId,
      provider_name: providerName,
      offer_id: item.offer_id ?? offer?.id ?? null,
      offer_status: item.offer_status ?? (offer ? "accepted" : null),
      accepted_at: item.accepted_at ?? offer?.updated_at ?? null,
      conversation_id: item.conversation_id ?? (conv?.id as string) ?? null,
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

function baseRequestSelect() {
  return `id, customer_id, category_id, title, description, budget_max, currency, location,
    status, revision_feedback, work_submitted_at, order_payment_status, order_amount,
    payout_status, paid_at, refund_dispute_status, refunded_at, cancellation_reason,
    archived_at, trashed_at, created_at, updated_at,
    customer:profiles!requests_customer_id_fkey(id, full_name, avatar_url),
    category:categories(id, name, slug)`;
}

export async function listCustomerOrderHistory(
  supabase: SupabaseClient,
  customerId: string,
  filters: OrderHistoryFilters = {}
): Promise<{ items: OrderHistoryItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? ORDER_HISTORY_PAGE_SIZE, 1),
    50
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("requests")
    .select(baseRequestSelect(), { count: "exact" })
    .eq("customer_id", customerId);

  query = applyTabFilter(query, filters.tab);
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    query = query.eq("order_payment_status", filters.paymentStatus);
  }
  if (filters.refundDisputeStatus && filters.refundDisputeStatus !== "all") {
    query = query.eq("refund_dispute_status", filters.refundDisputeStatus);
  }
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.location?.trim()) {
    query = query.ilike("location", `%${filters.location.trim()}%`);
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(`title.ilike.%${q}%,id.eq.${q}`);
  }
  if (filters.amountMin != null) {
    query = query.gte("order_amount", filters.amountMin);
  }
  if (filters.amountMax != null) {
    query = query.lte("order_amount", filters.amountMax);
  }

  query = applySort(query, filters.sort).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("[order-history] customer list failed", error.message);
    return { items: [], total: 0, page, pageSize };
  }

  const mapped = ((data ?? []) as unknown as RawRequest[]).map((row) =>
    mapItem(row)
  );
  const items = await enrichOrders(supabase, mapped);
  return { items, total: count ?? items.length, page, pageSize };
}

export async function listProviderOrderHistory(
  supabase: SupabaseClient,
  providerId: string,
  filters: OrderHistoryFilters = {}
): Promise<{ items: OrderHistoryItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? ORDER_HISTORY_PAGE_SIZE, 1),
    50
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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
    return { items: [], total: 0, page, pageSize };
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

  const { data: requests, error: reqError } = await supabase
    .from("requests")
    .select(baseRequestSelect())
    .in("id", requestIds);

  if (reqError) {
    console.error("[order-history] provider requests failed", reqError.message);
    return { items: [], total: 0, page, pageSize };
  }

  const requestById = new Map(
    ((requests ?? []) as unknown as RawRequest[]).map((r) => [String(r.id), r])
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

  mapped = mapped.filter((item) => {
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
      if (
        !item.title.toLowerCase().includes(q) &&
        item.id.toLowerCase() !== q
      ) {
        return false;
      }
    }
    return true;
  });

  const items = await enrichOrders(supabase, mapped);
  return { items, total: count ?? items.length, page, pageSize };
}

export async function listAdminOrderHistory(
  admin: SupabaseClient,
  filters: OrderHistoryFilters = {}
): Promise<{ items: OrderHistoryItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? ORDER_HISTORY_PAGE_SIZE, 1),
    50
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("requests")
    .select(baseRequestSelect(), { count: "exact" });

  query = applyTabFilter(query, filters.tab);

  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    query = query.eq("order_payment_status", filters.paymentStatus);
  }
  if (filters.refundDisputeStatus && filters.refundDisputeStatus !== "all") {
    query = query.eq("refund_dispute_status", filters.refundDisputeStatus);
  }
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.location?.trim()) {
    query = query.ilike("location", `%${filters.location.trim()}%`);
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(`title.ilike.%${q}%,id.eq.${q},location.ilike.%${q}%`);
  }
  if (filters.amountMin != null) query = query.gte("order_amount", filters.amountMin);
  if (filters.amountMax != null) query = query.lte("order_amount", filters.amountMax);

  // Provider filter: restrict to request ids with accepted offer from provider.
  if (filters.providerId) {
    const { data: offers } = await admin
      .from("offers")
      .select("request_id")
      .eq("provider_id", filters.providerId)
      .eq("status", "accepted");
    const ids = (offers ?? []).map((o) => o.request_id as string);
    if (!ids.length) {
      return { items: [], total: 0, page, pageSize };
    }
    query = query.in("id", ids);
  }

  query = applySort(query, filters.sort).range(from, to);
  const { data, error, count } = await query;
  if (error) {
    console.error("[order-history] admin list failed", error.message);
    return { items: [], total: 0, page, pageSize };
  }

  let items = await enrichOrders(
    admin,
    ((data ?? []) as unknown as RawRequest[]).map((row) => mapItem(row))
  );

  if (filters.testOnly === true) {
    items = items.filter((i) => i.is_test);
  } else if (filters.testOnly === false) {
    items = items.filter((i) => !i.is_test);
  }

  return { items, total: count ?? items.length, page, pageSize };
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
