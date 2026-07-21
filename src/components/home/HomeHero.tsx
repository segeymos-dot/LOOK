"use client";

import { Button } from "@/components/ui/Button";
import { PrimaryButton } from "@/components/ui/v2/PrimaryButton";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { PlusCircle, Search, Sparkles } from "lucide-react";

export function HomeHero() {
  const { user, isProvider, isCustomer, displayProfile, profile } = useAuth();
  const { t } = useTranslation();
  const name = (displayProfile ?? profile)?.full_name?.split(" ")[0];
  const createHref = user ? "/requests/new" : "/login?redirect=/requests/new";
  const showCreateOrder = !user || isCustomer || (!isProvider && !displayProfile?.role);

  if (isProvider && !isCustomer) {
    return (
      <Card padding="lg" className="gradient-brand overflow-hidden text-white">
        <div className="relative">
          <Sparkles className="absolute -right-2 -top-2 h-16 w-16 text-white/10" />
          <p className="text-sm font-medium text-white/80">
            {name ? t("home.hello", { name }) : t("home.helloShort")}
          </p>
          <h1 className="mb-2 mt-1 text-2xl font-extrabold tracking-tight">{t("home.findOrders")}</h1>
          <p className="mb-5 text-sm leading-relaxed text-white/80">{t("home.providerDesc")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/search" className="flex-1">
              <Button variant="secondary" className="w-full gap-2 bg-white text-brand-700 hover:bg-white/90">
                <Search className="h-5 w-5" />
                {t("home.browseOrders")}
              </Button>
            </Link>
            <Link href="/my/offers" className="flex-1">
              <Button variant="ghost" className="w-full text-white hover:bg-white/15">
                {t("home.myOffers")}
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="gradient-brand overflow-hidden text-white">
      <div className="relative">
        <Sparkles className="absolute -right-2 -top-2 h-16 w-16 text-white/10" />
        <p className="text-sm font-medium text-white/80">
          {name ? t("home.hello", { name }) : t("home.welcome")}
        </p>
        <h1 className="mb-2 mt-1 text-2xl font-extrabold tracking-tight">
          {isProvider ? t("home.ordersAndProviders") : t("home.findProvider")}
        </h1>
        <p className="mb-5 text-sm leading-relaxed text-white/80">
          {isProvider ? t("home.bothDesc") : t("home.customerDesc")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {showCreateOrder && (
            <Link href={createHref} className="flex-1">
              <PrimaryButton fullWidth>
                <PlusCircle className="h-5 w-5" />
                {t("home.createOrder")}
              </PrimaryButton>
            </Link>
          )}
          {isCustomer && user && (
            <Link href="/my/requests" className="flex-1">
              <Button variant="ghost" className="w-full text-white hover:bg-white/15">
                {t("home.myOrders")}
              </Button>
            </Link>
          )}
          {isProvider && (
            <Link href="/search" className="flex-1">
              <Button
                variant={showCreateOrder ? "ghost" : "secondary"}
                className={`w-full gap-2 ${showCreateOrder ? "text-white hover:bg-white/15" : "bg-white text-brand-700 hover:bg-white/90"}`}
              >
                <Search className="h-5 w-5" />
                {t("home.findOrdersBtn")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
