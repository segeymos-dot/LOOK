import { createClient } from "@/lib/supabase/server";
import type { Review } from "@/types";

export async function getReviewsForProvider(providerId: string): Promise<Review[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reviews")
    .select("*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return [];

  return (data ?? []) as Review[];
}

export async function getConversationWithProvider(
  viewerId: string,
  providerId: string
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(customer_id.eq.${viewerId},provider_id.eq.${providerId}),and(customer_id.eq.${providerId},provider_id.eq.${viewerId})`
    )
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}
