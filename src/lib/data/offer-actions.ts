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

export type ProviderOfferExitResult =
  | {
      success: true;
      requestId: string;
      offerId?: string;
      offerStatus?: string;
      requestStatus?: string;
      restoredPendingOffers?: number;
    }
  | { success: false; error: string };

/** Provider withdraws a pending offer (order stays open). */
export async function providerWithdrawOffer(
  supabase: SupabaseClient,
  offerId: string
): Promise<ProviderOfferExitResult> {
  const { data, error } = await supabase.rpc("provider_withdraw_offer", {
    p_offer_id: offerId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as {
    offer_id: string;
    request_id: string;
    offer_status: string;
    request_status: string;
  };

  return {
    success: true,
    requestId: result.request_id,
    offerId: result.offer_id,
    offerStatus: result.offer_status,
    requestStatus: result.request_status,
  };
}

/** Selected provider declines unpaid/pre-work job — reopens marketplace. */
export async function providerDeclineSelectedJob(
  supabase: SupabaseClient,
  requestId: string
): Promise<ProviderOfferExitResult> {
  const { data, error } = await supabase.rpc("provider_decline_selected_job", {
    p_request_id: requestId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as {
    request_id: string;
    declined_offer_id?: string;
    restored_pending_offers?: number;
    status?: string;
  };

  return {
    success: true,
    requestId: result.request_id,
    offerId: result.declined_offer_id,
    requestStatus: result.status ?? "open",
    restoredPendingOffers: result.restored_pending_offers,
  };
}
