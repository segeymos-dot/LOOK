import type { SupabaseClient } from "@supabase/supabase-js";
import type { Offer } from "@/types";

function buildConversationMap(
  conversations: { id: string; offer_id: string | null }[]
): Record<string, string> {
  return conversations.reduce<Record<string, string>>((map, conversation) => {
    if (conversation.offer_id) {
      map[conversation.offer_id] = conversation.id;
    }
    return map;
  }, {});
}

export type RequestOffersData = {
  offers: Offer[];
  conversations: Record<string, string>;
  userId: string | null;
  isCustomer?: boolean;
  ownOfferId?: string | null;
  ownOfferStatus?: string | null;
  error?: string;
};

export async function fetchRequestOffers(
  supabase: SupabaseClient,
  requestId: string,
  userId: string | null
): Promise<RequestOffersData> {
  if (!userId) {
    return { offers: [], conversations: {}, userId: null };
  }

  const [{ data: offers, error: offersError }, { data: conversations, error: convError }, { data: request }] =
    await Promise.all([
      supabase
        .from("offers")
        .select("*, provider:profiles(*)")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false }),
      supabase
        .from("conversations")
        .select("id, offer_id")
        .eq("request_id", requestId),
      supabase
        .from("requests")
        .select("customer_id")
        .eq("id", requestId)
        .single(),
    ]);

  if (offersError) {
    return {
      offers: [],
      conversations: {},
      userId,
      error: offersError.message,
    };
  }

  if (convError) {
    return {
      offers: offers ?? [],
      conversations: {},
      userId,
    };
  }

  const ownOffer = (offers ?? []).find((offer) => offer.provider_id === userId);

  return {
    offers: offers ?? [],
    conversations: buildConversationMap(conversations ?? []),
    userId,
    isCustomer: request?.customer_id === userId,
    ownOfferId: ownOffer?.id ?? null,
    ownOfferStatus: ownOffer?.status ?? null,
  };
}
