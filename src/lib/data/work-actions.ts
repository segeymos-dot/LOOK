import {
  encodeWorkAccepted,
  encodeWorkRevision,
  encodeWorkSubmit,
  formatWorkSubmitDisplay,
} from "@/lib/data/work-lifecycle-messages";
import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import {
  assertOrderPaidForWorkSubmission,
  isPaymentRequiredError,
  PAYMENT_REQUIRED_CODE,
  PAYMENT_REQUIRED_MESSAGE,
} from "@/lib/payments/work-submission-guard";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestStatus, WorkAttachment, OrderPaymentStatus } from "@/types";

export type WorkActionResult =
  | { success: true; requestId: string; status: RequestStatus; orderPaymentStatus?: OrderPaymentStatus; alreadyCompleted?: boolean }
  | { success: false; error: string; code?: string };

function isMissingRpc(errorMessage: string): boolean {
  return (
    errorMessage.includes("Could not find the function") ||
    errorMessage.includes("PGRST202")
  );
}

async function getAcceptedOfferContext(supabase: SupabaseClient, requestId: string) {
  const { data: request } = await supabase
    .from("requests")
    .select("id, status, customer_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return null;

  const { data: offer } = await supabase
    .from("offers")
    .select("id, provider_id, price, currency")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) return null;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("request_id", requestId)
    .maybeSingle();

  return {
    request,
    offer,
    conversationId: conversation?.id ?? null,
  };
}

async function submitWorkFallback(
  supabase: SupabaseClient,
  requestId: string,
  summary: string,
  attachments: WorkAttachment[]
): Promise<WorkActionResult> {
  const context = await getAcceptedOfferContext(supabase, requestId);
  if (!context) {
    return { success: false, error: "Заказ или принятое предложение не найдены" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== context.offer.provider_id) {
    return { success: false, error: "Not authorized to submit work for this order" };
  }

  if (context.request.status !== "in_progress") {
    return { success: false, error: "Work can only be submitted while order is in progress" };
  }

  // Backend enforcement when submit_work RPC is unavailable (chat-message fallback path).
  const paymentCheck = await assertOrderPaidForWorkSubmission(supabase, requestId);
  if (!("ok" in paymentCheck)) {
    return paymentCheck;
  }

  const lifecycle = await getWorkLifecycleState(supabase, requestId);
  if (lifecycle?.effectiveStatus === "pending_review") {
    return { success: false, error: "Work is already pending customer review" };
  }

  if (!context.conversationId) {
    return { success: false, error: "Conversation not found for this order" };
  }

  const revision = (lifecycle?.latestSubmission?.revision_number ?? 0) + 1;

  const payload = {
    summary: summary.trim(),
    attachments,
    revision,
  };

  const { error } = await supabase.from("messages").insert({
    conversation_id: context.conversationId,
    sender_id: user.id,
    content: `${encodeWorkSubmit(payload)}\n\n${formatWorkSubmitDisplay(payload)}`,
  });

  if (error) return { success: false, error: error.message };

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", context.conversationId);

  return { success: true, requestId, status: "pending_review" };
}

async function requestRevisionFallback(
  supabase: SupabaseClient,
  requestId: string,
  feedback: string
): Promise<WorkActionResult> {
  const context = await getAcceptedOfferContext(supabase, requestId);
  if (!context) {
    return { success: false, error: "Request not found or not authorized" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== context.request.customer_id) {
    return { success: false, error: "Request not found or not authorized" };
  }

  const lifecycle = await getWorkLifecycleState(supabase, requestId);
  if (lifecycle?.effectiveStatus !== "pending_review") {
    return { success: false, error: "Revision can only be requested while work is pending review" };
  }

  if (!context.conversationId) {
    return { success: false, error: "Conversation not found for this order" };
  }

  const payload = { feedback: feedback.trim() };
  const { error } = await supabase.from("messages").insert({
    conversation_id: context.conversationId,
    sender_id: user.id,
    content: `${encodeWorkRevision(payload)}\n\n🔄 Заказ отправлен на доработку.\n\n${payload.feedback}`,
  });

  if (error) return { success: false, error: error.message };

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", context.conversationId);

  return { success: true, requestId, status: "in_progress" };
}

async function acceptWorkFallback(
  supabase: SupabaseClient,
  requestId: string
): Promise<WorkActionResult & { paymentId?: string }> {
  const context = await getAcceptedOfferContext(supabase, requestId);
  if (!context) {
    return { success: false, error: "Request not found or not authorized" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== context.request.customer_id) {
    return { success: false, error: "Request not found or not authorized" };
  }

  const lifecycle = await getWorkLifecycleState(supabase, requestId);

  if (lifecycle?.effectiveStatus === "completed") {
    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("request_id", requestId)
      .eq("status", "paid")
      .maybeSingle();

    return {
      success: true,
      requestId,
      status: "completed",
      orderPaymentStatus: "completed",
      alreadyCompleted: true,
      paymentId: payment?.id,
    };
  }

  if (lifecycle?.effectiveStatus !== "pending_review") {
    return { success: false, error: "Work can only be accepted while pending customer review" };
  }

  // Payment must exist before acceptance — no duplicate charges on accept (see migration 024).
  const paymentCheck = await assertOrderPaidForWorkSubmission(supabase, requestId);
  if (!("ok" in paymentCheck)) {
    return {
      success: false,
      error: "Order must be paid before work can be accepted.",
      code: PAYMENT_REQUIRED_CODE,
    };
  }

  const { data: paymentRow } = await supabase
    .from("payments")
    .select("id")
    .eq("request_id", requestId)
    .eq("status", "paid")
    .maybeSingle();

  const { data: updated, error: updateError } = await supabase
    .from("requests")
    .update({
      status: "completed",
      order_payment_status: "completed",
      revision_feedback: null,
    })
    .eq("id", requestId)
    .eq("status", "pending_review")
    .eq("customer_id", user.id)
    .select("status, order_payment_status")
    .maybeSingle();

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  if (!updated) {
    const { data: current } = await supabase
      .from("requests")
      .select("status, order_payment_status")
      .eq("id", requestId)
      .maybeSingle();

    if (current?.status === "completed") {
      return {
        success: true,
        requestId,
        status: "completed",
        orderPaymentStatus: "completed",
        alreadyCompleted: true,
        paymentId: paymentRow?.id,
      };
    }

    return { success: false, error: "Work can only be accepted while pending customer review" };
  }

  if (context.conversationId) {
    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      sender_id: user.id,
      content: `${encodeWorkAccepted()}\n\n✅ Заказчик принял работу. Заказ завершён.`,
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", context.conversationId);
  }

  return {
    success: true,
    requestId,
    status: "completed",
    orderPaymentStatus: "completed",
    paymentId: paymentRow?.id,
  };
}

export async function submitWork(
  supabase: SupabaseClient,
  requestId: string,
  summary: string,
  attachments: WorkAttachment[] = []
): Promise<WorkActionResult> {
  // Application-layer guard (API + server actions). RPC has an identical check in migration 023.
  const paymentCheck = await assertOrderPaidForWorkSubmission(supabase, requestId);
  if (!("ok" in paymentCheck)) {
    return paymentCheck;
  }

  const { data, error } = await supabase.rpc("submit_work", {
    p_request_id: requestId,
    p_summary: summary,
    p_attachments: attachments,
  });

  if (!error) {
    const result = data as { request_id: string; status: RequestStatus };
    return { success: true, requestId: result.request_id, status: result.status };
  }

  if (isPaymentRequiredError(error.message)) {
    return {
      success: false,
      error: PAYMENT_REQUIRED_MESSAGE,
      code: PAYMENT_REQUIRED_CODE,
    };
  }

  if (!isMissingRpc(error.message)) {
    return { success: false, error: error.message };
  }

  return submitWorkFallback(supabase, requestId, summary, attachments);
}

export async function requestRevision(
  supabase: SupabaseClient,
  requestId: string,
  feedback: string
): Promise<WorkActionResult> {
  const { data, error } = await supabase.rpc("request_revision", {
    p_request_id: requestId,
    p_feedback: feedback,
  });

  if (!error) {
    const result = data as { request_id: string; status: RequestStatus };
    return { success: true, requestId: result.request_id, status: result.status };
  }

  if (!isMissingRpc(error.message)) {
    return { success: false, error: error.message };
  }

  return requestRevisionFallback(supabase, requestId, feedback);
}

export async function acceptWork(
  supabase: SupabaseClient,
  requestId: string
): Promise<WorkActionResult & { paymentId?: string }> {
  const { data, error } = await supabase.rpc("accept_work", {
    p_request_id: requestId,
  });

  if (!error) {
    const result = data as {
      request_id: string;
      status: RequestStatus;
      payment_id?: string;
      order_payment_status?: OrderPaymentStatus;
      already_completed?: boolean;
    };
    return {
      success: true,
      requestId: result.request_id,
      status: result.status,
      paymentId: result.payment_id,
      orderPaymentStatus: result.order_payment_status ?? "completed",
      alreadyCompleted: result.already_completed === true,
    };
  }

  if (!isMissingRpc(error.message)) {
    return { success: false, error: error.message };
  }

  return acceptWorkFallback(supabase, requestId);
}

export async function getLatestWorkSubmission(
  supabase: SupabaseClient,
  requestId: string
) {
  const dbSubmission = await supabase
    .from("work_submissions")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dbSubmission.data) return dbSubmission.data;
  if (dbSubmission.error && !dbSubmission.error.message.includes("does not exist")) {
    return null;
  }

  const lifecycle = await getWorkLifecycleState(supabase, requestId);
  return lifecycle?.latestSubmission ?? null;
}
