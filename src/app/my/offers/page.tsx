import { AppLayout } from "@/components/layout/AppLayout";
import { OfferCard } from "@/components/offers/OfferCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { isDemoMode } from "@/lib/config";
import { mockOffers } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";

export default async function MyOffersPage() {
  if (isDemoMode()) {
    return (
      <AppLayout activePath="/profile" title="Мои предложения">
        <div className="space-y-5 p-4">
          <PageHeader
            title="Мои предложения"
            subtitle="Отклики на заказы других пользователей"
            backHref="/profile"
          />
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
    <AppLayout activePath="/profile" title="Мои предложения">
      <div className="space-y-5 p-4">
        <PageHeader
          title="Мои предложения"
          subtitle="Отклики на заказы других пользователей"
          backHref="/profile"
        />

        {offers && offers.length > 0 ? (
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title="Вы ещё не отправляли предложений"
            description="Найдите подходящий заказ и отправьте отклик"
            action={
              <Link href="/search">
                <Button>Найти заказы</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
