import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfferStatus,
  OrderPaymentStatus,
  OrderPayoutStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";
import {
  ORDER_CANCELLED_PREFIX,
  ORDER_DISPUTE_PREFIX,
  ORDER_DISPUTE_RESOLVED_PREFIX,
  ORDER_REFUNDED_PREFIX,
  WORK_ACCEPTED_PREFIX,
  WORK_REVISION_PREFIX,
  WORK_SUBMIT_PREFIX,
} from "@/lib/data/work-lifecycle-messages";

export type AdminOrderParty = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  email_verified: boolean | null;
};

export type AdminOrderOffer = {
  id: string;
  provider_id: string;
  provider_name: string | null;
  price: number;
  currency: string;
  message: string;
  estimated_days: number | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
  selected: boolean;
};

export type AdminOrderPayment = {
  id: string;
  status: string;
  amount_gross: number;
  platform_fee: number;
  provider_amount: number;
  currency: string;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
} | null;

export type AdminOrderCommission = {
  id: string;
  commission_rate: number;
  commission_amount: number;
  gross_amount: number;
  currency: string;
  created_at: string;
} | null;

export type AdminOrderFinance = {
  order_amount: number | null;
  currency: string;
  order_payment_status: OrderPaymentStatus | null;
  look_commission: number | null;
  provider_payout_amount: number | null;
  payout_status: OrderPayoutStatus | null;
  paid_at: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  provider_net: number | null;
  refund_dispute_status: RefundDisputeStatus | null;
  refund_amount: number | null;
  refund_reason: string | null;
  refunded_at: string | null;
  cancellation_reason: string | null;
  payment: AdminOrderPayment;
  commission: AdminOrderCommission;
};

export type AdminOrderMessage = {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_role: "customer" | "provider" | "system" | "unknown";
  content: string;
  created_at: string;
  attachment_urls: Array<{ name?: string; url: string; type?: string }>;
};

export type AdminOrderReview = {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_name: string | null;
  reviewee_name: string | null;
  direction: "customer_to_provider" | "provider_to_customer" | "other";
};

export type AdminOrderDispute = {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolution_decision: string | null;
  resolution_note: string | null;
} | null;

export type AdminOrderTimelineEvent = {
  id: string;
  type:
    | "created"
    | "offer_submitted"
    | "provider_selected"
    | "paid"
    | "started"
    | "submitted"
    | "customer_accepted"
    | "completed"
    | "review"
    | "dispute"
    | "refund"
    | "cancel"
    | "revision";
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: "customer" | "provider" | "system" | "admin" | null;
  label: string;
  meta?: Record<string, string | number | null>;
};

export type AdminOrderDetail = {
  order: {
    id: string;
    title: string;
    description: string;
    status: RequestStatus;
    category_id: string | null;
    category_name: string | null;
    category_slug: string | null;
    location: string | null;
    currency: string;
    budget_min: number | null;
    budget_max: number | null;
    created_at: string;
    updated_at: string;
    work_submitted_at: string | null;
    archived_at: string | null;
  };
  customer: AdminOrderParty;
  selected_provider: AdminOrderParty | null;
  offers: AdminOrderOffer[];
  finance: AdminOrderFinance;
  conversation_id: string | null;
  message_count: number;
  reviews: AdminOrderReview[];
  dispute: AdminOrderDispute;
  timeline: AdminOrderTimelineEvent[];
};

function asProfile(value: unknown): { id?: string; full_name?: string; phone?: string } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return row as { id?: string; full_name?: string; phone?: string };
}

function asCategory(value: unknown): { id?: string; name?: string; slug?: string } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return row as { id?: string; name?: string; slug?: string };
}

async function lookupEmails(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, { email: string | null; email_verified: boolean | null }>> {
  const map = new Map<string, { email: string | null; email_verified: boolean | null }>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error || !data.user) {
          map.set(id, { email: null, email_verified: null });
          return;
        }
        map.set(id, {
          email: data.user.email ?? null,
          email_verified: Boolean(data.user.email_confirmed_at),
        });
      } catch {
        map.set(id, { email: null, email_verified: null });
      }
    })
  );
  return map;
}

function parseAttachments(
  raw: unknown
): Array<{ name?: string; url: string; type?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name?: string; url: string; type?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: string; url?: string; type?: string };
    if (!row.url) continue;
    out.push({ name: row.name, url: row.url, type: row.type });
  }
  return out;
}

function buildTimeline(input: {
  order: AdminOrderDetail["order"];
  customer: AdminOrderParty;
  selectedProvider: AdminOrderParty | null;
  offers: AdminOrderOffer[];
  finance: AdminOrderFinance;
  reviews: AdminOrderReview[];
  dispute: AdminOrderDispute;
  workSubmissions: Array<{ created_at: string; provider_id: string; revision_number: number }>;
  systemHints: Array<{ at: string; type: AdminOrderTimelineEvent["type"]; actor_id: string | null }>;
}): AdminOrderTimelineEvent[] {
  const events: AdminOrderTimelineEvent[] = [];

  events.push({
    id: `created-${input.order.id}`,
    type: "created",
    at: input.order.created_at,
    actor_id: input.customer.id,
    actor_name: input.customer.full_name,
    actor_role: "customer",
    label: "created",
  });

  for (const offer of input.offers) {
    events.push({
      id: `offer-${offer.id}`,
      type: "offer_submitted",
      at: offer.created_at,
      actor_id: offer.provider_id,
      actor_name: offer.provider_name,
      actor_role: "provider",
      label: "offer_submitted",
      meta: {
        offer_id: offer.id,
        amount: offer.price,
        status: offer.status,
      },
    });
  }

  const selected = input.offers.find((o) => o.selected);
  if (selected) {
    events.push({
      id: `selected-${selected.id}`,
      type: "provider_selected",
      at: selected.updated_at || selected.created_at,
      actor_id: input.customer.id,
      actor_name: input.customer.full_name,
      actor_role: "customer",
      label: "provider_selected",
      meta: {
        provider_id: selected.provider_id,
        provider_name: selected.provider_name,
        amount: selected.price,
      },
    });
  }

  const paidAt = input.finance.paid_at ?? input.finance.payment?.paid_at ?? null;
  if (paidAt) {
    events.push({
      id: `paid-${input.order.id}`,
      type: "paid",
      at: paidAt,
      actor_id: input.customer.id,
      actor_name: input.customer.full_name,
      actor_role: "customer",
      label: "paid",
      meta: {
        amount: input.finance.order_amount ?? input.finance.payment?.amount_gross ?? null,
      },
    });
    if (input.order.status !== "open") {
      events.push({
        id: `started-${input.order.id}`,
        type: "started",
        at: paidAt,
        actor_id: selected?.provider_id ?? input.selectedProvider?.id ?? null,
        actor_name: selected?.provider_name ?? input.selectedProvider?.full_name ?? null,
        actor_role: "provider",
        label: "started",
      });
    }
  }

  for (const submission of input.workSubmissions) {
    events.push({
      id: `submit-${submission.created_at}-${submission.revision_number}`,
      type: "submitted",
      at: submission.created_at,
      actor_id: submission.provider_id,
      actor_name: input.selectedProvider?.full_name ?? selected?.provider_name ?? null,
      actor_role: "provider",
      label: "submitted",
      meta: { revision: submission.revision_number },
    });
  }

  if (
    input.order.work_submitted_at &&
    !input.workSubmissions.some((s) => s.created_at === input.order.work_submitted_at)
  ) {
    events.push({
      id: `submit-flag-${input.order.id}`,
      type: "submitted",
      at: input.order.work_submitted_at,
      actor_id: selected?.provider_id ?? input.selectedProvider?.id ?? null,
      actor_name: selected?.provider_name ?? input.selectedProvider?.full_name ?? null,
      actor_role: "provider",
      label: "submitted",
    });
  }

  for (const hint of input.systemHints) {
    events.push({
      id: `hint-${hint.type}-${hint.at}`,
      type: hint.type,
      at: hint.at,
      actor_id: hint.actor_id,
      actor_name:
        hint.actor_id === input.customer.id
          ? input.customer.full_name
          : hint.actor_id === input.selectedProvider?.id
            ? input.selectedProvider.full_name
            : null,
      actor_role:
        hint.actor_id === input.customer.id
          ? "customer"
          : hint.actor_id === input.selectedProvider?.id
            ? "provider"
            : "system",
      label: hint.type,
    });
  }

  if (input.order.status === "completed") {
    const completedAt =
      input.systemHints.find((h) => h.type === "customer_accepted" || h.type === "completed")?.at ??
      input.order.updated_at;
    if (!events.some((e) => e.type === "completed")) {
      events.push({
        id: `completed-${input.order.id}`,
        type: "completed",
        at: completedAt,
        actor_id: input.customer.id,
        actor_name: input.customer.full_name,
        actor_role: "customer",
        label: "completed",
      });
    }
  }

  for (const review of input.reviews) {
    events.push({
      id: `review-${review.id}`,
      type: "review",
      at: review.created_at,
      actor_id: review.reviewer_id,
      actor_name: review.reviewer_name,
      actor_role:
        review.direction === "customer_to_provider"
          ? "customer"
          : review.direction === "provider_to_customer"
            ? "provider"
            : null,
      label: "review",
      meta: { rating: review.rating },
    });
  }

  if (input.dispute) {
    events.push({
      id: `dispute-${input.dispute.id}`,
      type: "dispute",
      at: input.dispute.created_at,
      actor_id: null,
      actor_name: null,
      actor_role: "system",
      label: "dispute",
      meta: { status: input.dispute.status },
    });
  }

  if (input.finance.refunded_at) {
    events.push({
      id: `refund-${input.order.id}`,
      type: "refund",
      at: input.finance.refunded_at,
      actor_id: null,
      actor_name: null,
      actor_role: "system",
      label: "refund",
      meta: {
        amount: input.finance.refund_amount,
        reason: input.finance.refund_reason,
      },
    });
  }

  if (input.order.status === "cancelled") {
    events.push({
      id: `cancel-${input.order.id}`,
      type: "cancel",
      at: input.order.updated_at,
      actor_id: input.customer.id,
      actor_name: input.customer.full_name,
      actor_role: "customer",
      label: "cancel",
      meta: { reason: input.finance.cancellation_reason },
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
}

export async function getAdminOrderDetail(
  admin: SupabaseClient,
  orderId: string
): Promise<AdminOrderDetail | null> {
  const { data: request, error } = await admin
    .from("requests")
    .select(
      `
      id, title, description, status, category_id, location, currency,
      budget_min, budget_max, created_at, updated_at, work_submitted_at, archived_at,
      customer_id, order_payment_status, order_amount, look_commission, provider_payout_amount,
      payout_status, paid_at, refund_dispute_status, refund_amount, refund_reason, refunded_at,
      cancellation_reason,
      customer:profiles!requests_customer_id_fkey(id, full_name, phone),
      category:categories(id, name, slug)
    `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !request) return null;

  const customerProfile = asProfile(request.customer);
  const category = asCategory(request.category);
  const customerId = String(request.customer_id);

  const [
    { data: offerRows },
    { data: paymentRow },
    { data: commissionRow },
    { data: conversationRow },
    { data: reviewRows },
    { data: disputeRow },
    { data: submissionRows },
  ] = await Promise.all([
    admin
      .from("offers")
      .select(
        `
        id, provider_id, price, currency, message, estimated_days, status, created_at, updated_at,
        provider:profiles!offers_provider_id_fkey(id, full_name, phone)
      `
      )
      .eq("request_id", orderId)
      .order("created_at", { ascending: true }),
    admin
      .from("payments")
      .select(
        "id, status, amount_gross, platform_fee, provider_amount, currency, payment_method, paid_at, created_at, provider_id"
      )
      .eq("request_id", orderId)
      .maybeSingle(),
    admin
      .from("platform_commissions")
      .select("id, commission_rate, commission_amount, gross_amount, currency, created_at")
      .eq("request_id", orderId)
      .maybeSingle(),
    admin
      .from("conversations")
      .select("id, provider_id, customer_id")
      .eq("request_id", orderId)
      .maybeSingle(),
    admin
      .from("reviews")
      .select(
        `
        id, rating, comment, created_at, reviewer_id, reviewee_id, provider_id,
        reviewer:profiles!reviews_reviewer_id_fkey(id, full_name)
      `
      )
      .eq("request_id", orderId)
      .order("created_at", { ascending: true }),
    admin
      .from("order_disputes")
      .select(
        "id, status, reason, created_at, resolved_at, resolution_decision, resolution_note"
      )
      .eq("request_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("work_submissions")
      .select("id, provider_id, created_at, revision_number")
      .eq("request_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  const offers: AdminOrderOffer[] = (offerRows ?? []).map((o) => {
    const provider = asProfile(o.provider);
    const status = o.status as OfferStatus;
    return {
      id: String(o.id),
      provider_id: String(o.provider_id),
      provider_name: provider?.full_name ?? null,
      price: Number(o.price),
      currency: String(o.currency ?? request.currency ?? "USD"),
      message: String(o.message ?? ""),
      estimated_days: o.estimated_days == null ? null : Number(o.estimated_days),
      status,
      created_at: String(o.created_at),
      updated_at: String(o.updated_at),
      selected: status === "accepted",
    };
  });

  const selectedOffer = offers.find((o) => o.selected) ?? null;
  const selectedProviderId =
    selectedOffer?.provider_id ??
    (paymentRow?.provider_id as string | undefined) ??
    (conversationRow?.provider_id as string | undefined) ??
    null;

  let selectedProviderProfile = selectedOffer
    ? asProfile(
        (offerRows ?? []).find((o) => String(o.provider_id) === selectedOffer.provider_id)?.provider
      )
    : null;

  if (selectedProviderId && !selectedProviderProfile?.full_name) {
    const { data: providerRow } = await admin
      .from("profiles")
      .select("id, full_name, phone")
      .eq("id", selectedProviderId)
      .maybeSingle();
    selectedProviderProfile = asProfile(providerRow);
  }

  const emailIds = [customerId, selectedProviderId].filter(Boolean) as string[];
  const emails = await lookupEmails(admin, emailIds);
  const customerAuth = emails.get(customerId) ?? { email: null, email_verified: null };
  const providerAuth = selectedProviderId
    ? emails.get(selectedProviderId) ?? { email: null, email_verified: null }
    : null;

  const customer: AdminOrderParty = {
    id: customerId,
    full_name: customerProfile?.full_name ?? null,
    phone: customerProfile?.phone ?? null,
    email: customerAuth.email,
    email_verified: customerAuth.email_verified,
  };

  const selected_provider: AdminOrderParty | null = selectedProviderId
    ? {
        id: selectedProviderId,
        full_name: selectedProviderProfile?.full_name ?? selectedOffer?.provider_name ?? null,
        phone: selectedProviderProfile?.phone ?? null,
        email: providerAuth?.email ?? null,
        email_verified: providerAuth?.email_verified ?? null,
      }
    : null;

  const payment: AdminOrderPayment = paymentRow
    ? {
        id: String(paymentRow.id),
        status: String(paymentRow.status),
        amount_gross: Number(paymentRow.amount_gross),
        platform_fee: Number(paymentRow.platform_fee),
        provider_amount: Number(paymentRow.provider_amount),
        currency: String(paymentRow.currency ?? request.currency ?? "USD"),
        payment_method: (paymentRow.payment_method as string | null) ?? null,
        paid_at: (paymentRow.paid_at as string | null) ?? null,
        created_at: String(paymentRow.created_at),
      }
    : null;

  const commission: AdminOrderCommission = commissionRow
    ? {
        id: String(commissionRow.id),
        commission_rate: Number(commissionRow.commission_rate),
        commission_amount: Number(commissionRow.commission_amount),
        gross_amount: Number(commissionRow.gross_amount),
        currency: String(commissionRow.currency ?? request.currency ?? "USD"),
        created_at: String(commissionRow.created_at),
      }
    : null;

  const orderAmount =
    request.order_amount != null
      ? Number(request.order_amount)
      : payment?.amount_gross ?? selectedOffer?.price ?? null;
  const commissionAmount =
    request.look_commission != null
      ? Number(request.look_commission)
      : commission?.commission_amount ?? payment?.platform_fee ?? null;
  const providerNet =
    request.provider_payout_amount != null
      ? Number(request.provider_payout_amount)
      : payment?.provider_amount ??
        (orderAmount != null && commissionAmount != null
          ? Number((orderAmount - commissionAmount).toFixed(2))
          : null);
  const commissionRate =
    commission?.commission_rate ??
    (orderAmount && commissionAmount != null && orderAmount > 0
      ? Number((commissionAmount / orderAmount).toFixed(4))
      : null);

  const finance: AdminOrderFinance = {
    order_amount: orderAmount,
    currency: String(request.currency ?? "USD"),
    order_payment_status: (request.order_payment_status as OrderPaymentStatus | null) ?? null,
    look_commission: commissionAmount,
    provider_payout_amount: providerNet,
    payout_status: (request.payout_status as OrderPayoutStatus | null) ?? null,
    paid_at: (request.paid_at as string | null) ?? payment?.paid_at ?? null,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    provider_net: providerNet,
    refund_dispute_status: (request.refund_dispute_status as RefundDisputeStatus | null) ?? null,
    refund_amount: request.refund_amount == null ? null : Number(request.refund_amount),
    refund_reason: (request.refund_reason as string | null) ?? null,
    refunded_at: (request.refunded_at as string | null) ?? null,
    cancellation_reason: (request.cancellation_reason as string | null) ?? null,
    payment,
    commission,
  };

  const conversation_id = conversationRow ? String(conversationRow.id) : null;
  let message_count = 0;
  const systemHints: Array<{
    at: string;
    type: AdminOrderTimelineEvent["type"];
    actor_id: string | null;
  }> = [];

  if (conversation_id) {
    const { count, data: lifecycleMsgs } = await admin
      .from("messages")
      .select("id, sender_id, content, created_at", { count: "exact" })
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });

    message_count = count ?? lifecycleMsgs?.length ?? 0;

    for (const m of lifecycleMsgs ?? []) {
      const content = String(m.content ?? "");
      const at = String(m.created_at);
      const actor_id = (m.sender_id as string | null) ?? null;
      if (content.startsWith(WORK_SUBMIT_PREFIX)) {
        systemHints.push({ at, type: "submitted", actor_id });
      } else if (content.startsWith(WORK_REVISION_PREFIX)) {
        systemHints.push({ at, type: "revision", actor_id });
      } else if (content.startsWith(WORK_ACCEPTED_PREFIX)) {
        systemHints.push({ at, type: "customer_accepted", actor_id });
        systemHints.push({ at, type: "completed", actor_id });
      } else if (content.startsWith(ORDER_CANCELLED_PREFIX)) {
        systemHints.push({ at, type: "cancel", actor_id });
      } else if (content.startsWith(ORDER_REFUNDED_PREFIX)) {
        systemHints.push({ at, type: "refund", actor_id });
      } else if (content.startsWith(ORDER_DISPUTE_PREFIX)) {
        systemHints.push({ at, type: "dispute", actor_id });
      } else if (content.startsWith(ORDER_DISPUTE_RESOLVED_PREFIX)) {
        systemHints.push({ at, type: "dispute", actor_id });
      }
    }
  }

  const reviewPartyIds = [
    ...new Set(
      (reviewRows ?? [])
        .flatMap((r) => [r.reviewer_id, r.reviewee_id])
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];
  const reviewNames = new Map<string, string | null>();
  if (reviewPartyIds.length > 0) {
    const { data: reviewProfiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", reviewPartyIds);
    for (const p of reviewProfiles ?? []) {
      reviewNames.set(String(p.id), (p.full_name as string | null) ?? null);
    }
  }

  const reviews: AdminOrderReview[] = (reviewRows ?? []).map((r) => {
    const reviewer = asProfile(r.reviewer);
    const reviewerId = String(r.reviewer_id);
    const revieweeId = String(r.reviewee_id);
    let direction: AdminOrderReview["direction"] = "other";
    if (reviewerId === customerId && selectedProviderId && revieweeId === selectedProviderId) {
      direction = "customer_to_provider";
    } else if (
      selectedProviderId &&
      reviewerId === selectedProviderId &&
      revieweeId === customerId
    ) {
      direction = "provider_to_customer";
    }
    return {
      id: String(r.id),
      rating: Number(r.rating),
      comment: String(r.comment ?? ""),
      created_at: String(r.created_at),
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      reviewer_name: reviewer?.full_name ?? reviewNames.get(reviewerId) ?? null,
      reviewee_name: reviewNames.get(revieweeId) ?? null,
      direction,
    };
  });

  const dispute: AdminOrderDispute = disputeRow
    ? {
        id: String(disputeRow.id),
        status: String(disputeRow.status),
        reason: String(disputeRow.reason ?? ""),
        created_at: String(disputeRow.created_at),
        resolved_at: (disputeRow.resolved_at as string | null) ?? null,
        resolution_decision: (disputeRow.resolution_decision as string | null) ?? null,
        resolution_note: (disputeRow.resolution_note as string | null) ?? null,
      }
    : null;

  const order = {
    id: String(request.id),
    title: String(request.title),
    description: String(request.description ?? ""),
    status: request.status as RequestStatus,
    category_id: (request.category_id as string | null) ?? category?.id ?? null,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
    location: (request.location as string | null) ?? null,
    currency: String(request.currency ?? "USD"),
    budget_min: request.budget_min == null ? null : Number(request.budget_min),
    budget_max: request.budget_max == null ? null : Number(request.budget_max),
    created_at: String(request.created_at),
    updated_at: String(request.updated_at),
    work_submitted_at: (request.work_submitted_at as string | null) ?? null,
    archived_at: (request.archived_at as string | null) ?? null,
  };

  const timeline = buildTimeline({
    order,
    customer,
    selectedProvider: selected_provider,
    offers,
    finance,
    reviews,
    dispute,
    workSubmissions: (submissionRows ?? []).map((s) => ({
      created_at: String(s.created_at),
      provider_id: String(s.provider_id),
      revision_number: Number(s.revision_number ?? 1),
    })),
    systemHints,
  });

  return {
    order,
    customer,
    selected_provider,
    offers,
    finance,
    conversation_id,
    message_count,
    reviews,
    dispute,
    timeline,
  };
}

export async function getAdminOrderMessages(
  admin: SupabaseClient,
  orderId: string,
  opts?: { limit?: number; before?: string }
): Promise<{
  conversation_id: string | null;
  customer_id: string | null;
  provider_id: string | null;
  items: AdminOrderMessage[];
  has_more: boolean;
  total: number;
} | null> {
  const { data: request } = await admin
    .from("requests")
    .select("id, customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!request) return null;

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, customer_id, provider_id")
    .eq("request_id", orderId)
    .maybeSingle();

  if (!conversation) {
    return {
      conversation_id: null,
      customer_id: String(request.customer_id),
      provider_id: null,
      items: [],
      has_more: false,
      total: 0,
    };
  }

  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
  let query = admin
    .from("messages")
    .select(
      "id, sender_id, content, created_at, attachment_urls, sender:profiles!messages_sender_id_fkey(full_name)",
      { count: "exact" }
    )
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (opts?.before) {
    query = query.lt("created_at", opts.before);
  }

  const { data: rows, count } = await query;
  const raw = rows ?? [];
  const has_more = raw.length > limit;
  const page = has_more ? raw.slice(0, limit) : raw;
  // Return chronological order for UI.
  page.reverse();

  const customerId = String(conversation.customer_id);
  const providerId = String(conversation.provider_id);

  const items: AdminOrderMessage[] = page.map((m) => {
    const senderId = (m.sender_id as string | null) ?? null;
    const content = String(m.content ?? "");
    const isSystem =
      !senderId ||
      content.startsWith("LOOK:") ||
      content.startsWith("📋") ||
      content.startsWith("🔄") ||
      content.startsWith("✅") ||
      content.startsWith("🚫") ||
      content.startsWith("💸") ||
      content.startsWith("⚠️");
    let sender_role: AdminOrderMessage["sender_role"] = "unknown";
    if (isSystem && (!senderId || senderId === customerId || senderId === providerId)) {
      // Lifecycle system texts are often sent as participant; classify by prefix.
      if (content.startsWith("LOOK:") || /^[📋🔄✅🚫💸⚠️]/.test(content)) {
        sender_role = "system";
      } else if (senderId === customerId) sender_role = "customer";
      else if (senderId === providerId) sender_role = "provider";
    } else if (senderId === customerId) sender_role = "customer";
    else if (senderId === providerId) sender_role = "provider";

    return {
      id: String(m.id),
      sender_id: senderId,
      sender_name: asProfile(m.sender)?.full_name ?? null,
      sender_role,
      content,
      created_at: String(m.created_at),
      attachment_urls: parseAttachments(m.attachment_urls),
    };
  });

  return {
    conversation_id: String(conversation.id),
    customer_id: customerId,
    provider_id: providerId,
    items,
    has_more,
    total: count ?? items.length,
  };
}
