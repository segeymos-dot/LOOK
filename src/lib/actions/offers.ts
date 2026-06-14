"use server";

import { acceptOffer, rejectOffer } from "@/lib/data/offer-actions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type OfferActionResult =
  | { success: true; requestId: string; conversationId?: string }
  | { success: false; error: string };

export async function acceptOfferAction(
  offerId: string
): Promise<OfferActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Необходима авторизация" };
  }

  const result = await acceptOffer(supabase, offerId);

  if (!result.success) {
    return result;
  }

  revalidatePath(`/requests/${result.requestId}`);
  revalidatePath("/my/requests");
  revalidatePath("/my/offers");
  revalidatePath("/chat");

  return result;
}

export async function rejectOfferAction(
  offerId: string
): Promise<OfferActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Необходима авторизация" };
  }

  const result = await rejectOffer(supabase, offerId);

  if (!result.success) {
    return result;
  }

  revalidatePath(`/requests/${result.requestId}`);
  revalidatePath("/my/offers");

  return result;
}
