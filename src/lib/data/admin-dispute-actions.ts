import type { SupabaseClient } from "@supabase/supabase-js";
import {
  areTestPaymentsEnabled,
  TEST_PAYMENTS_DISABLED_MESSAGE,
} from "@/lib/payments/test-payments-guard";
import type { DisputeResolutionDecision } from "@/types";
import type { SettlementPreview } from "@/lib/admin/disputes";
import {
  encodeOrderDisputeResolved,
} from "@/lib/data/work-lifecycle-messages";

export type ResolveDisputeInput = {
  disputeId: string;
  adminId: string;
  decision: DisputeResolutionDecision;
  resolutionNote: string;
  customerRefund?: number | null;
  providerRelease?: number | null;
  idempotencyKey?: string | null;
};

export async function previewDisputeSettlement(
  admin: SupabaseClient,
  input: Omit<ResolveDisputeInput, "adminId" | "resolutionNote" | "idempotencyKey"> & {
    customerRefund?: number | null;
    providerRelease?: number | null;
  }
): Promise<{ success: true; preview: SettlementPreview } | { success: false; error: string }> {
  const { data, error } = await admin.rpc("preview_dispute_settlement", {
    p_dispute_id: input.disputeId,
    p_decision: input.decision,
    p_customer_refund: input.customerRefund ?? null,
    p_provider_release: input.providerRelease ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, preview: data as SettlementPreview };
}

export async function resolveDisputeAsAdmin(
  admin: SupabaseClient,
  userClient: SupabaseClient,
  input: ResolveDisputeInput
): Promise<
  | {
      success: true;
      result: Record<string, unknown>;
      alreadyResolved?: boolean;
    }
  | { success: false; error: string; code?: string }
> {
  if (!areTestPaymentsEnabled()) {
    return { success: false, error: TEST_PAYMENTS_DISABLED_MESSAGE, code: "TEST_PAYMENTS_DISABLED" };
  }

  const note = input.resolutionNote.trim();
  if (note.length < 5) {
    return { success: false, error: "Resolution note is required (min 5 characters)" };
  }

  const { data, error } = await admin.rpc("resolve_order_dispute", {
    p_dispute_id: input.disputeId,
    p_admin_id: input.adminId,
    p_decision: input.decision,
    p_resolution_note: note,
    p_customer_refund: input.customerRefund ?? null,
    p_provider_release: input.providerRelease ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  const alreadyResolved = Boolean(result.already_resolved);

  if (!alreadyResolved) {
    await notifyPartiesOfResolution(admin, userClient, {
      requestId: String(result.request_id),
      adminId: input.adminId,
      decision: input.decision,
      note,
      customerRefund: Number(result.customer_refund ?? 0),
      providerRelease: Number(result.provider_release ?? 0),
      currency: String((result.preview as { currency?: string } | undefined)?.currency ?? "USD"),
    });
  }

  return { success: true, result, alreadyResolved };
}

async function notifyPartiesOfResolution(
  admin: SupabaseClient,
  _userClient: SupabaseClient,
  payload: {
    requestId: string;
    adminId: string;
    decision: DisputeResolutionDecision;
    note: string;
    customerRefund: number;
    providerRelease: number;
    currency: string;
  }
) {
  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("request_id", payload.requestId)
    .maybeSingle();

  if (!conversation?.id) return;

  const content = encodeOrderDisputeResolved({
    decision: payload.decision,
    note: payload.note,
    customerRefund: payload.customerRefund,
    providerRelease: payload.providerRelease,
    currency: payload.currency,
  });

  await admin.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: payload.adminId,
    content,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);
}
