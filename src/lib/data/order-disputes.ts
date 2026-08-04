import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDispute, UserRole } from "@/types";

export async function getOrderDisputeForRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<OrderDispute | null> {
  const { data, error } = await supabase
    .from("order_disputes")
    .select(
      "id, request_id, payment_id, opened_by, reason, status, resolution_note, resolved_at, created_at, updated_at"
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

  const { data: opener } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("id", data.opened_by)
    .maybeSingle();

  return {
    id: data.id,
    request_id: data.request_id,
    payment_id: data.payment_id,
    opened_by: data.opened_by,
    reason: data.reason,
    status: data.status as OrderDispute["status"],
    resolution_note: data.resolution_note,
    resolved_at: data.resolved_at,
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
  };
}
