import { fetchRequestOffers } from "@/lib/data/request-offers";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Prefer passing an existing server client + userId to avoid duplicate getUser. */
export async function getRequestOffersForPage(
  requestId: string,
  options?: { supabase?: SupabaseClient; userId?: string | null }
) {
  const supabase = options?.supabase ?? (await createClient());
  let userId = options?.userId;
  if (userId === undefined) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  return fetchRequestOffers(supabase, requestId, userId ?? null);
}
