import { canActAsProvider } from "@/lib/auth/roles";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DirectedProviderCard = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  rating: number;
  reviews_count: number;
  completed_orders_count: number;
  provider_category_slugs: string[];
};

/**
 * Load a public provider card for "propose order" (?provider=).
 * Returns null when id is missing, not a provider, or profile is hidden.
 */
export async function fetchDirectedProviderCard(
  supabase: SupabaseClient,
  providerId: string
): Promise<DirectedProviderCard | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, role, rating, reviews_count, completed_orders_count, public_profile_visible, provider_category_slugs"
    )
    .eq("id", providerId)
    .maybeSingle();

  if (error || !data) return null;
  if (!canActAsProvider(data.role)) return null;
  if (data.public_profile_visible === false) return null;

  return {
    id: data.id,
    full_name: data.full_name,
    avatar_url: data.avatar_url ?? null,
    rating: Number(data.rating ?? 0),
    reviews_count: Number(data.reviews_count ?? 0),
    completed_orders_count: Number(data.completed_orders_count ?? 0),
    provider_category_slugs: Array.isArray(data.provider_category_slugs)
      ? data.provider_category_slugs
      : [],
  };
}

/**
 * Link an open request to a chosen provider via the existing conversations row.
 * Same relation used after offers; customer may insert as a participant.
 */
export async function linkRequestToProvider(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    customerId: string;
    providerId: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.customerId === input.providerId) {
    return { ok: false, error: "Cannot link request to yourself" };
  }

  const { error } = await supabase.from("conversations").upsert(
    {
      request_id: input.requestId,
      customer_id: input.customerId,
      provider_id: input.providerId,
      offer_id: null,
      last_message_at: new Date().toISOString(),
    },
    { onConflict: "request_id,provider_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
