import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  areTestPaymentsEnabled,
  isTestPaymentActor,
  TEST_PAYMENTS_ACTOR_DENIED_MESSAGE,
  TEST_PAYMENTS_DISABLED_MESSAGE,
} from "@/lib/payments/test-payments-guard";
import {
  encodeOrderCancelled,
  encodeOrderDispute,
  encodeOrderRefunded,
} from "@/lib/data/work-lifecycle-messages";
import { previewCancelOutcome } from "@/lib/orders/cancel-outcome";
import type {
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";

export type CancelOutcome =
  | "cancelled_unpaid"
  | "refunded"
  | "dispute_opened"
  | "already_refunded"
  | "already_disputed";

export type { CancelOutcome as CancelOutcomeType };
export { previewCancelOutcome };

export type CancelOrderResult =
  | {
      success: true;
      requestId: string;
      status: RequestStatus;
      outcome: CancelOutcome;
      orderPaymentStatus?: OrderPaymentStatus;
      refundDisputeStatus?: RefundDisputeStatus;
      refundAmount?: number;
      disputeId?: string;
      alreadyProcessed?: boolean;
    }
  | { success: false; error: string; code?: string };

type OrderCancelContext = {
  request: {
    id: string;
    customer_id: string;
    status: RequestStatus;
    order_payment_status: OrderPaymentStatus | null;
    work_submitted_at: string | null;
    refund_dispute_status: RefundDisputeStatus | null;
    title: string;
    currency: string;
  };
  payment: {
    id: string;
    status: string;
    amount_gross: number;
    provider_amount: number;
    currency: string;
    payment_method: string | null;
    provider_id: string;
    customer_id: string;
  } | null;
  conversationId: string | null;
  hasWorkSubmission: boolean;
  providerId: string | null;
};

function isPaidOrder(ctx: OrderCancelContext): boolean {
  if (ctx.payment?.status === "paid") return true;
  if (ctx.payment?.status === "refunded") return true;
  const ops = ctx.request.order_payment_status;
  return ops === "paid" || ops === "completed" || ops === "refunded";
}

function workHasStartedOrSubmitted(ctx: OrderCancelContext): boolean {
  if (ctx.request.status === "pending_review") return true;
  if (ctx.request.work_submitted_at) return true;
  if (ctx.hasWorkSubmission) return true;
  return false;
}

async function loadCancelContext(
  supabase: SupabaseClient,
  requestId: string
): Promise<OrderCancelContext | null> {
  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, customer_id, status, order_payment_status, work_submitted_at, refund_dispute_status, title, currency"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return null;

  const [{ data: payment }, { data: conversation }, { data: submission }] =
    await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, status, amount_gross, provider_amount, currency, payment_method, provider_id, customer_id"
        )
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("id")
        .eq("request_id", requestId)
        .maybeSingle(),
      supabase
        .from("work_submissions")
        .select("id")
        .eq("request_id", requestId)
        .limit(1)
        .maybeSingle(),
    ]);

  const { data: offer } = await supabase
    .from("offers")
    .select("provider_id")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  return {
    request: {
      ...request,
      order_payment_status: (request.order_payment_status as OrderPaymentStatus) ?? null,
      refund_dispute_status:
        (request.refund_dispute_status as RefundDisputeStatus) ?? "none",
    },
    payment: payment
      ? {
          ...payment,
          amount_gross: Number(payment.amount_gross),
          provider_amount: Number(payment.provider_amount),
        }
      : null,
    conversationId: conversation?.id ?? null,
    hasWorkSubmission: Boolean(submission?.id),
    providerId: offer?.provider_id ?? payment?.provider_id ?? null,
  };
}

async function insertSystemMessage(
  supabase: SupabaseClient,
  conversationId: string,
  senderId: string,
  content: string
) {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function cancelUnpaid(
  supabase: SupabaseClient,
  ctx: OrderCancelContext,
  userId: string,
  reason: string
): Promise<CancelOrderResult> {
  const { data, error } = await supabase.rpc("cancel_request", {
    p_request_id: ctx.request.id,
  });

  if (error) {
    // Fallback if RPC outdated / missing paid guard not yet applied
    if (
      error.message.includes("PAID_ORDER") ||
      error.message.toLowerCase().includes("paid")
    ) {
      return { success: false, error: error.message, code: "PAID_ORDER" };
    }

    const { error: updateError } = await supabase
      .from("requests")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
      })
      .eq("id", ctx.request.id)
      .eq("customer_id", userId)
      .in("status", ["open", "in_progress", "pending_review"]);

    if (updateError) {
      return { success: false, error: updateError.message };
    }
  }

  if (ctx.conversationId) {
    await insertSystemMessage(
      supabase,
      ctx.conversationId,
      userId,
      encodeOrderCancelled({ reason, outcome: "cancelled_unpaid" })
    );
  }

  const result = (data as { request_id?: string; status?: RequestStatus } | null) ?? null;
  return {
    success: true,
    requestId: ctx.request.id,
    status: result?.status ?? "cancelled",
    outcome: "cancelled_unpaid",
    orderPaymentStatus: ctx.request.order_payment_status ?? "unpaid",
    refundDisputeStatus: "none",
  };
}

async function refundPaidBeforeWork(
  supabase: SupabaseClient,
  ctx: OrderCancelContext,
  user: { id: string; email?: string | null },
  isAdmin: boolean,
  reason: string
): Promise<CancelOrderResult> {
  if (!areTestPaymentsEnabled()) {
    return { success: false, error: TEST_PAYMENTS_DISABLED_MESSAGE, code: "TEST_PAYMENTS_DISABLED" };
  }
  if (!isTestPaymentActor({ email: user.email, isPlatformAdmin: isAdmin })) {
    return {
      success: false,
      error: TEST_PAYMENTS_ACTOR_DENIED_MESSAGE,
      code: "TEST_ACTOR_DENIED",
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is required for test refunds",
      code: "MISSING_SERVICE_ROLE",
    };
  }

  if (ctx.payment?.status === "refunded" || ctx.request.order_payment_status === "refunded") {
    return {
      success: true,
      requestId: ctx.request.id,
      status: "cancelled",
      outcome: "already_refunded",
      orderPaymentStatus: "refunded",
      refundDisputeStatus: "refunded",
      refundAmount: ctx.payment?.amount_gross,
      alreadyProcessed: true,
    };
  }

  let { data, error } = await admin.rpc("apply_test_refund", {
    p_request_id: ctx.request.id,
    p_reason: reason,
  });

  if (error) {
    // Fallback to legacy RPC name
    if (error.message.includes("Could not find") || error.message.includes("PGRST202")) {
      const legacy = await admin.rpc("simulate_test_refund", {
        p_request_id: ctx.request.id,
      });
      if (legacy.error) {
        return { success: false, error: legacy.error.message };
      }
      data = legacy.data;
      error = null;
      await admin
        .from("requests")
        .update({
          status: "cancelled",
          order_payment_status: "refunded",
          refund_dispute_status: "refunded",
          refund_amount: ctx.payment?.amount_gross ?? null,
          refund_reason: reason,
          refunded_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq("id", ctx.request.id);
    } else {
      return { success: false, error: error.message };
    }
  }

  const refundResult = data as {
    refund_amount?: number;
    already_refunded?: boolean;
    status?: string;
  } | null;

  if (ctx.conversationId) {
    await insertSystemMessage(
      supabase,
      ctx.conversationId,
      user.id,
      encodeOrderRefunded({
        reason,
        amount: Number(refundResult?.refund_amount ?? ctx.payment?.amount_gross ?? 0),
        currency: ctx.payment?.currency ?? ctx.request.currency,
      })
    );
  }

  return {
    success: true,
    requestId: ctx.request.id,
    status: "cancelled",
    outcome: refundResult?.already_refunded ? "already_refunded" : "refunded",
    orderPaymentStatus: "refunded",
    refundDisputeStatus: "refunded",
    refundAmount: Number(refundResult?.refund_amount ?? ctx.payment?.amount_gross ?? 0),
    alreadyProcessed: Boolean(refundResult?.already_refunded),
  };
}

async function openDispute(
  supabase: SupabaseClient,
  ctx: OrderCancelContext,
  userId: string,
  reason: string
): Promise<CancelOrderResult> {
  if (ctx.request.refund_dispute_status === "dispute_opened") {
    return {
      success: true,
      requestId: ctx.request.id,
      status: ctx.request.status,
      outcome: "already_disputed",
      orderPaymentStatus: ctx.request.order_payment_status ?? "paid",
      refundDisputeStatus: "dispute_opened",
      alreadyProcessed: true,
    };
  }

  const { data, error } = await supabase.rpc("open_order_dispute", {
    p_request_id: ctx.request.id,
    p_reason: reason,
  });

  if (error) {
    // App-level fallback if RPC missing
    if (error.message.includes("Could not find") || error.message.includes("PGRST202")) {
      const { data: dispute, error: insertError } = await supabase
        .from("order_disputes")
        .insert({
          request_id: ctx.request.id,
          payment_id: ctx.payment?.id ?? null,
          opened_by: userId,
          reason,
          status: "opened",
        })
        .select("id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          return {
            success: true,
            requestId: ctx.request.id,
            status: ctx.request.status,
            outcome: "already_disputed",
            orderPaymentStatus: ctx.request.order_payment_status ?? "paid",
            refundDisputeStatus: "dispute_opened",
            alreadyProcessed: true,
          };
        }
        return { success: false, error: insertError.message };
      }

      await supabase
        .from("requests")
        .update({
          refund_dispute_status: "dispute_opened",
          refund_reason: reason,
          cancellation_reason: reason,
        })
        .eq("id", ctx.request.id);

      if (ctx.conversationId) {
        await insertSystemMessage(
          supabase,
          ctx.conversationId,
          userId,
          encodeOrderDispute({ reason })
        );
      }

      return {
        success: true,
        requestId: ctx.request.id,
        status: ctx.request.status,
        outcome: "dispute_opened",
        orderPaymentStatus: ctx.request.order_payment_status ?? "paid",
        refundDisputeStatus: "dispute_opened",
        disputeId: dispute.id,
      };
    }
    return { success: false, error: error.message };
  }

  const result = data as {
    dispute_id?: string;
    already_opened?: boolean;
    status?: string;
  };

  if (ctx.conversationId && !result.already_opened) {
    await insertSystemMessage(
      supabase,
      ctx.conversationId,
      userId,
      encodeOrderDispute({ reason })
    );
  }

  return {
    success: true,
    requestId: ctx.request.id,
    status: ctx.request.status,
    outcome: result.already_opened ? "already_disputed" : "dispute_opened",
    orderPaymentStatus: ctx.request.order_payment_status ?? "paid",
    refundDisputeStatus: "dispute_opened",
    disputeId: result.dispute_id,
    alreadyProcessed: Boolean(result.already_opened),
  };
}

export async function cancelOrderSafe(
  supabase: SupabaseClient,
  requestId: string,
  user: { id: string; email?: string | null },
  options: {
    reason?: string;
    isPlatformAdmin?: boolean;
  } = {}
): Promise<CancelOrderResult> {
  const reason =
    options.reason?.trim() ||
    "Customer cancelled order";

  const ctx = await loadCancelContext(supabase, requestId);
  if (!ctx) {
    return { success: false, error: "Request not found or not authorized" };
  }

  if (ctx.request.customer_id !== user.id && !options.isPlatformAdmin) {
    return { success: false, error: "Request not found or not authorized" };
  }

  if (
    ctx.request.status !== "open" &&
    ctx.request.status !== "in_progress" &&
    ctx.request.status !== "pending_review"
  ) {
    // Allow repair of cancelled-but-still-paid via refund path for admin/test
    if (
      ctx.request.status === "cancelled" &&
      isPaidOrder(ctx) &&
      ctx.payment?.status === "paid"
    ) {
      return refundPaidBeforeWork(
        supabase,
        ctx,
        user,
        Boolean(options.isPlatformAdmin),
        reason
      );
    }
    return { success: false, error: "Request cannot be cancelled in its current status" };
  }

  if (!isPaidOrder(ctx) || ctx.payment?.status === "refunded") {
    if (ctx.payment?.status === "refunded" || ctx.request.order_payment_status === "refunded") {
      return {
        success: true,
        requestId: ctx.request.id,
        status: "cancelled",
        outcome: "already_refunded",
        orderPaymentStatus: "refunded",
        refundDisputeStatus: "refunded",
        alreadyProcessed: true,
      };
    }
    return cancelUnpaid(supabase, ctx, user.id, reason);
  }

  if (workHasStartedOrSubmitted(ctx)) {
    return openDispute(supabase, ctx, user.id, reason);
  }

  return refundPaidBeforeWork(
    supabase,
    ctx,
    user,
    Boolean(options.isPlatformAdmin),
    reason
  );
}
