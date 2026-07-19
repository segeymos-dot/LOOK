import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestStatus } from "@/types";

export type RequestLifecycleResult =
  | { success: true; requestId: string; status: RequestStatus }
  | { success: false; error: string };

export async function completeRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestLifecycleResult> {
  const { data, error } = await supabase.rpc("complete_request", {
    p_request_id: requestId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as { request_id: string; status: RequestStatus };
  return {
    success: true,
    requestId: result.request_id,
    status: result.status,
  };
}

function isMissingCancelRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("cancel_request") &&
    (lower.includes("schema cache") ||
      lower.includes("could not find the function") ||
      lower.includes("pgrst202"))
  );
}

async function cancelRequestDirect(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestLifecycleResult> {
  const { data: request, error: fetchError } = await supabase
    .from("requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { success: false, error: "Request not found or not authorized" };
  }

  if (request.status !== "open" && request.status !== "in_progress" && request.status !== "pending_review") {
    return { success: false, error: "Request cannot be cancelled in its current status" };
  }

  const { error: updateError } = await supabase
    .from("requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, requestId, status: "cancelled" };
}

export async function cancelRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestLifecycleResult> {
  const { data, error } = await supabase.rpc("cancel_request", {
    p_request_id: requestId,
  });

  if (!error) {
    const result = data as { request_id: string; status: RequestStatus };
    return {
      success: true,
      requestId: result.request_id,
      status: result.status,
    };
  }

  if (isMissingCancelRpcError(error.message)) {
    return cancelRequestDirect(supabase, requestId);
  }

  return { success: false, error: error.message };
}
