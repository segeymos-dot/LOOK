"use client";

import { OfferListTabs } from "@/components/offers/OfferListTabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { Offer } from "@/types";
import Link from "next/link";
import { Briefcase } from "lucide-react";

interface MyOffersContentProps {
  offers: Offer[];
}

export function MyOffersContent({ offers }: MyOffersContentProps) {
  const { t } = useTranslation();

  return (
    <AppLayout activePath="/profile" title={t("offer.myOffers")}>
      <div className="space-y-5 p-4">
        <PageHeader
          title={t("offer.myOffers")}
          subtitle={t("offer.myOffersSub")}
          backHref="/profile"
        />

        {offers.length > 0 ? (
          <OfferListTabs offers={offers} />
        ) : (
          <EmptyState
            icon={Briefcase}
            title={t("offer.emptyTitle")}
            description={t("offer.emptyDesc")}
            action={
              <Link href="/search">
                <Button>{t("offer.findOrders")}</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
