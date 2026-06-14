"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchRequestOffers, type RequestOffersData } from "@/lib/data/request-offers";

export type RequestOffersResult = RequestOffersData;

export async function getRequestOffersAction(
  requestId: string
): Promise<RequestOffersResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return fetchRequestOffers(supabase, requestId, user?.id ?? null);
}
