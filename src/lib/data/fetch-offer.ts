import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_PROVIDER_CARD_SELECT } from "@/lib/profile/public-provider-profile";
import type { Offer } from "@/types";

export async function fetchOfferById(
  supabase: SupabaseClient,
  offerId: string,
  requestId: string
): Promise<Offer | null> {
  const { data, error } = await supabase
    .from("offers")
    .select(
      `*, provider:profiles(${PUBLIC_PROVIDER_CARD_SELECT}), request:requests(*)`
    )
    .eq("id", offerId)
    .eq("request_id", requestId)
    .single();

  if (error || !data) return null;
  return data as unknown as Offer;
}
