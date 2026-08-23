import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DisputeResolutionDecision,
  OrderDisputeStatus,
  OrderPaymentStatus,
  RequestStatus,
} from "@/types";

export type AdminDisputeListItem = {
  id: string;
  status: OrderDisputeStatus;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolution_decision: DisputeResolutionDecision | null;
  resolution_note: string | null;
  customer_refund_amount: number | null;
  provider_release_amount: number | null;
  platform_fee_retained: number | null;
  request_id: string;
  request_title: string;
  request_status: RequestStatus;
  order_payment_status: OrderPaymentStatus | null;
  refund_dispute_status: string | null;
  customer_id: string;
  customer_name: string;
  provider_id: string | null;
  provider_name: string | null;
  opened_by: string;
  opener_name: string;
  amount_gross: number | null;
  currency: string;
  payment_status: string | null;
  conversation_id: string | null;
};

export type AdminDisputeDetail = AdminDisputeListItem & {
  amounts_before: Record<string, unknown> | null;
  amounts_after: Record<string, unknown> | null;
  resolved_by: string | null;
  resolver_name: string | null;
  revision_history: Array<{ at: string; feedback: string }>;
  work_submissions: Array<{
    id: string;
    summary: string;
    revision_number: number;
    created_at: string;
  }>;
};

export type AdminDisputeFilters = {
  status?: string;
  q?: string;
  customerId?: string;
  providerId?: string;
  requestId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

function mapRow(row: Record<string, unknown>): AdminDisputeListItem {
  const request = (row.request ?? {}) as Record<string, unknown>;
  const customer = (row.customer ?? request.customer ?? {}) as Record<string, unknown>;
  const opener = (row.opener ?? {}) as Record<string, unknown>;
  const payment = (row.payment ?? {}) as Record<string, unknown>;
  const offer = (row.offer ?? {}) as Record<string, unknown>;
  const provider = (offer.provider ?? row.provider ?? {}) as Record<string, unknown>;
  const conversation = (row.conversation ?? {}) as Record<string, unknown>;

  return {
    id: String(row.id),
    status: row.status as OrderDisputeStatus,
    reason: String(row.reason ?? ""),
    created_at: String(row.created_at),
    resolved_at: (row.resolved_at as string) ?? null,
    resolution_decision: (row.resolution_decision as DisputeResolutionDecision) ?? null,
    resolution_note: (row.resolution_note as string) ?? null,
    customer_refund_amount:
      row.customer_refund_amount != null ? Number(row.customer_refund_amount) : null,
    provider_release_amount:
      row.provider_release_amount != null ? Number(row.provider_release_amount) : null,
    platform_fee_retained:
      row.platform_fee_retained != null ? Number(row.platform_fee_retained) : null,
    request_id: String(row.request_id),
    request_title: String(request.title ?? "—"),
    request_status: (request.status as RequestStatus) ?? "open",
    order_payment_status: (request.order_payment_status as OrderPaymentStatus) ?? null,
    refund_dispute_status: (request.refund_dispute_status as string) ?? null,
    customer_id: String(row.customer_id ?? request.customer_id ?? customer.id ?? ""),
    customer_name: String(customer.full_name ?? "—"),
    provider_id: (provider.id as string) ?? (payment.provider_id as string) ?? null,
    provider_name: (provider.full_name as string) ?? null,
    opened_by: String(row.opened_by),
    opener_name: String(opener.full_name ?? "—"),
    amount_gross: payment.amount_gross != null ? Number(payment.amount_gross) : null,
    currency: String(payment.currency ?? request.currency ?? "USD"),
    payment_status: (payment.status as string) ?? null,
    conversation_id: (conversation.id as string) ?? null,
  };
}

export async function listAdminDisputes(
  admin: SupabaseClient,
  filters: AdminDisputeFilters = {}
): Promise<{ items: AdminDisputeListItem[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("order_disputes")
    .select(
      `
      id, status, reason, created_at, resolved_at, resolution_decision, resolution_note,
      customer_refund_amount, provider_release_amount, platform_fee_retained,
      request_id, opened_by,
      request:requests!order_disputes_request_id_fkey(
        id, title, status, currency, order_payment_status, refund_dispute_status, customer_id,
        customer:profiles!requests_customer_id_fkey(id, full_name)
      ),
      opener:profiles!order_disputes_opened_by_fkey(id, full_name),
      payment:payments!order_disputes_payment_id_fkey(
        id, amount_gross, currency, status, provider_id
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") {
    if (filters.status === "open") query = query.eq("status", "opened");
    else if (filters.status === "resolved") query = query.neq("status", "opened");
    else query = query.eq("status", filters.status);
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters.requestId) query = query.eq("request_id", filters.requestId);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let items = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));

  // Enrich provider + conversation (accepted offer)
  const requestIds = [...new Set(items.map((i) => i.request_id))];
  if (requestIds.length) {
    const [{ data: offers }, { data: conversations }] = await Promise.all([
      admin
        .from("offers")
        .select("request_id, provider_id, provider:profiles!offers_provider_id_fkey(id, full_name)")
        .in("request_id", requestIds)
        .eq("status", "accepted"),
      admin.from("conversations").select("id, request_id").in("request_id", requestIds),
    ]);

    const offerByRequest = new Map(
      (offers ?? []).map((o) => {
        const prov = o.provider as { id?: string; full_name?: string } | null;
        return [
          o.request_id as string,
          {
            provider_id: (o.provider_id as string) ?? prov?.id ?? null,
            provider_name: prov?.full_name ?? null,
          },
        ];
      })
    );
    const convByRequest = new Map(
      (conversations ?? []).map((c) => [c.request_id as string, c.id as string])
    );

    items = items.map((item) => {
      const offer = offerByRequest.get(item.request_id);
      return {
        ...item,
        provider_id: item.provider_id ?? offer?.provider_id ?? null,
        provider_name: item.provider_name ?? offer?.provider_name ?? null,
        conversation_id: item.conversation_id ?? convByRequest.get(item.request_id) ?? null,
      };
    });
  }

  if (filters.customerId) {
    items = items.filter((i) => i.customer_id === filters.customerId);
  }
  if (filters.providerId) {
    items = items.filter((i) => i.provider_id === filters.providerId);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    items = items.filter(
      (i) =>
        i.request_title.toLowerCase().includes(q) ||
        i.customer_name.toLowerCase().includes(q) ||
        (i.provider_name ?? "").toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
    );
  }

  return { items, total: count ?? items.length };
}

export async function getAdminDisputeDetail(
  admin: SupabaseClient,
  disputeId: string
): Promise<AdminDisputeDetail | null> {
  const { data, error } = await admin
    .from("order_disputes")
    .select(
      `
      id, status, reason, created_at, resolved_at, resolution_decision, resolution_note,
      customer_refund_amount, provider_release_amount, platform_fee_retained,
      amounts_before, amounts_after, resolved_by,
      request_id, opened_by,
      request:requests!order_disputes_request_id_fkey(
        id, title, status, currency, order_payment_status, refund_dispute_status, customer_id,
        customer:profiles!requests_customer_id_fkey(id, full_name)
      ),
      opener:profiles!order_disputes_opened_by_fkey(id, full_name),
      resolver:profiles!order_disputes_resolved_by_fkey(id, full_name),
      payment:payments!order_disputes_payment_id_fkey(
        id, amount_gross, currency, status, provider_id
      )
    `
    )
    .eq("id", disputeId)
    .maybeSingle();

  if (error || !data) return null;

  const base = mapRow(data as Record<string, unknown>);
  const resolver = (data as { resolver?: { id?: string; full_name?: string } | null }).resolver;

  const [{ data: offer }, { data: conversation }, { data: submissions }] = await Promise.all([
    admin
      .from("offers")
      .select("provider_id, provider:profiles!offers_provider_id_fkey(id, full_name)")
      .eq("request_id", base.request_id)
      .eq("status", "accepted")
      .maybeSingle(),
    admin
      .from("conversations")
      .select("id")
      .eq("request_id", base.request_id)
      .maybeSingle(),
    admin
      .from("work_submissions")
      .select("id, summary, revision_number, created_at")
      .eq("request_id", base.request_id)
      .order("created_at", { ascending: true }),
  ]);

  let messages: Array<{ content: string; created_at: string }> = [];
  if (conversation?.id) {
    const { data: msgRows } = await admin
      .from("messages")
      .select("content, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });
    messages = msgRows ?? [];
  }

  const prov = offer?.provider as { id?: string; full_name?: string } | null;
  const revision_history = extractRevisionHistory(messages);

  return {
    ...base,
    provider_id: base.provider_id ?? (offer?.provider_id as string) ?? prov?.id ?? null,
    provider_name: base.provider_name ?? prov?.full_name ?? null,
    conversation_id: conversation?.id ?? null,
    amounts_before: (data.amounts_before as Record<string, unknown>) ?? null,
    amounts_after: (data.amounts_after as Record<string, unknown>) ?? null,
    resolved_by: (data.resolved_by as string) ?? null,
    resolver_name: resolver?.full_name ?? null,
    revision_history,
    work_submissions: (submissions ?? []).map((s) => ({
      id: String(s.id),
      summary: String(s.summary ?? ""),
      revision_number: Number(s.revision_number ?? 1),
      created_at: String(s.created_at),
    })),
  };
}

function extractRevisionHistory(
  messages: Array<{ content: string; created_at: string }>
): Array<{ at: string; feedback: string }> {
  const out: Array<{ at: string; feedback: string }> = [];
  for (const m of messages) {
    if (!m.content.startsWith("LOOK:WORK_REVISION:")) continue;
    try {
      const payload = JSON.parse(m.content.slice("LOOK:WORK_REVISION:".length)) as {
        feedback?: string;
      };
      if (payload.feedback?.trim()) {
        out.push({ at: m.created_at, feedback: payload.feedback });
      }
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

export type SettlementPreview = {
  dispute_id: string;
  request_id: string;
  payment_id: string;
  currency: string;
  decision: DisputeResolutionDecision;
  already_resolved: boolean;
  gross: number;
  original_platform_fee: number;
  original_provider_amount: number;
  customer_refund: number;
  provider_release: number;
  platform_fee_retained: number;
  provider_clawback: number;
  platform_fee_reversal: number;
  effects: Array<{
    party: string;
    label: string;
    amount: number;
    signed: number;
  }>;
};
