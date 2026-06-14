import { fetchOfferById } from "@/lib/data/fetch-offer";
import { createClient } from "@/lib/supabase/server";
import type { Offer } from "@/types";

export type OfferPageData = {
  offer: Offer | null;
  userId: string | null;
  conversationId: string | null;
};

export async function getOfferForPage(
  requestId: string,
  offerId: string
): Promise<OfferPageData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { offer: null, userId: null, conversationId: null };
  }

  const offer = await fetchOfferById(supabase, offerId, requestId);
  if (!offer) {
    return { offer: null, userId: user.id, conversationId: null };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("offer_id", offerId)
    .maybeSingle();

  return {
    offer,
    userId: user.id,
    conversationId: conversation?.id ?? null,
  };
}
