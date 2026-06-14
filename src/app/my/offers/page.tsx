import { AppLayout } from "@/components/layout/AppLayout";
import { OfferCard } from "@/components/offers/OfferCard";
import { isDemoMode } from "@/lib/config";
import { mockOffers } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MyOffersPage() {
  if (isDemoMode()) {
    return (
      <AppLayout activePath="/profile">
        <div className="space-y-4 p-4">
          <h1 className="text-xl font-bold">Мои предложения</h1>
          <div className="space-y-3">
            {mockOffers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/my/offers");

  const { data: offers } = await supabase
    .from("offers")
    .select("*, provider:profiles(*), request:requests(*)")
    .eq("provider_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <AppLayout activePath="/profile">
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-bold">Мои предложения</h1>

        {offers && offers.length > 0 ? (
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-gray-500">
            Вы ещё не отправляли предложений
          </p>
        )}
      </div>
    </AppLayout>
  );
}
