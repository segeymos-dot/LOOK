import { MyOffersContent } from "@/components/offers/MyOffersContent";
import { isDemoMode } from "@/lib/config";
import { mockOffers } from "@/lib/mock/data";
import { getWorkLifecycleState } from "@/lib/data/work-lifecycle-state";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MyOffersPage() {
  if (isDemoMode()) {
    return <MyOffersContent offers={mockOffers} />;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/my/offers");

  const { data: rawOffers } = await supabase
    .from("offers")
    .select(
      "*, provider:profiles(id, full_name, avatar_url, role, rating, reviews_count, completed_orders_count), request:requests(*)"
    )
    .eq("provider_id", user.id)
    .order("created_at", { ascending: false });

  const offers = await Promise.all(
    (rawOffers ?? []).map(async (offer) => {
      if (!offer.request || offer.request.status !== "in_progress") return offer;
      const lifecycle = await getWorkLifecycleState(supabase, offer.request_id);
      if (!lifecycle || lifecycle.effectiveStatus === offer.request.status) return offer;
      return {
        ...offer,
        request: { ...offer.request, status: lifecycle.effectiveStatus },
      };
    })
  );

  return <MyOffersContent offers={offers ?? []} />;
}
