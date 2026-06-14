import type { SupabaseClient } from "@supabase/supabase-js";

export type OfferRpcResult = {
  conversation_id?: string;
  request_id: string;
};

export type OfferActionData =
  | { success: true; requestId: string; conversationId?: string }
  | { success: false; error: string };

export async function acceptOffer(
  supabase: SupabaseClient,
  offerId: string
): Promise<OfferActionData> {
  const { data, error } = await supabase.rpc("accept_offer", {
    p_offer_id: offerId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as OfferRpcResult;
  return {
    success: true,
    requestId: result.request_id,
    conversationId: result.conversation_id,
  };
}

export async function rejectOffer(
  supabase: SupabaseClient,
  offerId: string
): Promise<OfferActionData> {
  const { data, error } = await supabase.rpc("reject_offer", {
    p_offer_id: offerId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as OfferRpcResult;
  return {
    success: true,
    requestId: result.request_id,
  };
}
