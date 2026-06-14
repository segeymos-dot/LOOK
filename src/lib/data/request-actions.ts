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

export async function cancelRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestLifecycleResult> {
  const { data, error } = await supabase.rpc("cancel_request", {
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
