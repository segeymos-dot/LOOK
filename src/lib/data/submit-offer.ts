import type { SupabaseClient } from "@supabase/supabase-js";

export type SubmitOfferInput = {
  requestId: string;
  price: number;
  message: string;
  estimatedDays?: number;
};

export type SubmitOfferResult =
  | { success: true; offerId: string }
  | { success: false; error: string };

export async function submitOffer(
  supabase: SupabaseClient,
  providerId: string,
  input: SubmitOfferInput
): Promise<SubmitOfferResult> {
  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, customer_id, status")
    .eq("id", input.requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: "Заказ не найден" };
  }

  if (request.status !== "open") {
    return { success: false, error: "На этот заказ больше нельзя откликнуться" };
  }

  if (request.customer_id === providerId) {
    return { success: false, error: "Нельзя откликнуться на свой заказ" };
  }

  const { data: existingOffer } = await supabase
    .from("offers")
    .select("id")
    .eq("request_id", input.requestId)
    .eq("provider_id", providerId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingOffer) {
    return { success: false, error: "Вы уже отправили отклик на этот заказ" };
  }

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .insert({
      request_id: input.requestId,
      provider_id: providerId,
      price: input.price,
      message: input.message,
      estimated_days: input.estimatedDays,
    })
    .select("id")
    .single();

  if (offerError || !offer) {
    return {
      success: false,
      error: offerError?.message ?? "Не удалось сохранить отклик",
    };
  }

  await supabase.from("conversations").upsert(
    {
      request_id: input.requestId,
      customer_id: request.customer_id,
      provider_id: providerId,
      offer_id: offer.id,
    },
    { onConflict: "request_id,provider_id" }
  );

  return { success: true, offerId: offer.id };
}
