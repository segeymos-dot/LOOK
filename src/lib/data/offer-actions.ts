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

export type UnassignProviderResult =
  | {
      success: true;
      requestId: string;
      previousProviderId?: string;
      restoredPendingOffers?: number;
    }
  | { success: false; error: string };

/** Customer cancels provider selection before payment/work — reopens marketplace. */
export async function unassignSelectedProvider(
  supabase: SupabaseClient,
  requestId: string
): Promise<UnassignProviderResult> {
  const { data, error } = await supabase.rpc("unassign_selected_provider", {
    p_request_id: requestId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as {
    request_id: string;
    previous_provider_id?: string;
    restored_pending_offers?: number;
  };

  return {
    success: true,
    requestId: result.request_id,
    previousProviderId: result.previous_provider_id,
    restoredPendingOffers: result.restored_pending_offers,
  };
}
