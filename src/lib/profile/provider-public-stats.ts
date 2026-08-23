import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ProviderPublicReputationStats = {
  completedOrdersCount: number;
  rating: number;
  reviewsCount: number;
};

/**
 * Public provider reputation from source of truth:
 * - completed orders: accepted offers whose request.status = 'completed' only
 *   (never payment paid / balance / in_progress — finance ≠ work completion)
 * - rating / reviews: published reviews of this user as provider
 *
 * Does not use profiles.completed_orders_count / rating / reviews_count
 * (denormalized counters can drift when accept_work falls back to client updates).
 */
export async function getProviderPublicReputationStats(
  providerId: string,
  fallback?: Partial<ProviderPublicReputationStats>
): Promise<ProviderPublicReputationStats> {
  const [completedOrdersCount, reviewStats] = await Promise.all([
    countCompletedOrdersAsProvider(providerId),
    getProviderReviewStats(providerId),
  ]);

  return {
    completedOrdersCount:
      completedOrdersCount ?? fallback?.completedOrdersCount ?? 0,
    rating: reviewStats.rating,
    reviewsCount: reviewStats.reviewsCount,
  };
}

async function countCompletedOrdersAsProvider(
  providerId: string
): Promise<number | null> {
  // Offers SELECT is party-only (RLS). Public visitors need a service-role count.
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: offers, error: offersError } = await admin
    .from("offers")
    .select("request_id")
    .eq("provider_id", providerId)
    .eq("status", "accepted");

  if (offersError) {
    console.error(
      "[provider-public-stats] completed orders offers query failed",
      offersError.message
    );
    return null;
  }

  const requestIds = (offers ?? [])
    .map((row) => row.request_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (requestIds.length === 0) return 0;

  const { count, error: requestsError } = await admin
    .from("requests")
    .select("id", { count: "exact", head: true })
    .in("id", requestIds)
    .eq("status", "completed");

  if (requestsError) {
    console.error(
      "[provider-public-stats] completed orders requests query failed",
      requestsError.message
    );
    return null;
  }

  return count ?? 0;
}

async function getProviderReviewStats(
  providerId: string
): Promise<{ rating: number; reviewsCount: number }> {
  const supabase = await createClient();

  // Reviews are publicly readable. Count + average from real rows only.
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("provider_id", providerId);

  if (error || !data) {
    return { rating: 0, reviewsCount: 0 };
  }

  const reviewsCount = data.length;
  if (reviewsCount === 0) {
    return { rating: 0, reviewsCount: 0 };
  }

  const sum = data.reduce((acc, row) => acc + Number(row.rating ?? 0), 0);
  const rating = Math.round((sum / reviewsCount) * 100) / 100;

  return { rating, reviewsCount };
}
