import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DisputeResolutionDecision,
  OrderDispute,
  OrderDisputeStatus,
  UserRole,
} from "@/types";

export async function getOrderDisputeForRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<OrderDispute | null> {
  const { data, error } = await supabase
    .from("order_disputes")
    .select(
      `id, request_id, payment_id, opened_by, reason, status,
       resolution_note, resolution_decision, resolved_by, resolved_at,
       customer_refund_amount, provider_release_amount, platform_fee_retained,
       amounts_before, amounts_after, created_at, updated_at`
    )
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[order-disputes] select failed", {
      requestId,
      message: error.message,
      code: error.code,
    });
    return null;
  }
  if (!data) return null;

  const profileIds = [data.opened_by, data.resolved_by].filter(
    (id): id is string => Boolean(id)
  );
  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role, is_platform_admin")
        .in("id", profileIds)
    : {
        data: [] as Array<{
          id: string;
          full_name: string;
          avatar_url: string | null;
          role: string | null;
          is_platform_admin: boolean | null;
        }>,
      };

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const opener = byId.get(data.opened_by);
  const resolver = data.resolved_by ? byId.get(data.resolved_by) : null;

  return {
    id: data.id,
    request_id: data.request_id,
    payment_id: data.payment_id,
    opened_by: data.opened_by,
    reason: data.reason,
    status: data.status as OrderDisputeStatus,
    resolution_note: data.resolution_note,
    resolution_decision: (data.resolution_decision as DisputeResolutionDecision) ?? null,
    resolved_by: data.resolved_by,
    resolved_at: data.resolved_at,
    customer_refund_amount:
      data.customer_refund_amount != null ? Number(data.customer_refund_amount) : null,
    provider_release_amount:
      data.provider_release_amount != null ? Number(data.provider_release_amount) : null,
    platform_fee_retained:
      data.platform_fee_retained != null ? Number(data.platform_fee_retained) : null,
    amounts_before: (data.amounts_before as Record<string, unknown>) ?? null,
    amounts_after: (data.amounts_after as Record<string, unknown>) ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    opener: opener
      ? {
          id: opener.id,
          full_name: opener.full_name,
          avatar_url: opener.avatar_url,
          role: (opener.role as UserRole | null) ?? null,
        }
      : null,
    resolver: resolver
      ? {
          id: resolver.id,
          full_name: resolver.full_name,
          role: (resolver.role as UserRole | null) ?? null,
          is_platform_admin: Boolean(resolver.is_platform_admin),
        }
      : null,
  };
}

export function isOpenDispute(dispute: OrderDispute | null | undefined): boolean {
  return dispute?.status === "opened";
}

export function isResolvedDispute(dispute: OrderDispute | null | undefined): boolean {
  return Boolean(dispute && dispute.status !== "opened");
}
