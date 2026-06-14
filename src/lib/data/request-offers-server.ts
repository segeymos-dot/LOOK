import { fetchRequestOffers } from "@/lib/data/request-offers";
import { createClient } from "@/lib/supabase/server";

export async function getRequestOffersForPage(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return fetchRequestOffers(supabase, requestId, user?.id ?? null);
}
