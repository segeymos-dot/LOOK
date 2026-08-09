"use client";

import { HomeHeroCard } from "@/components/home/HomeHeroCard";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";

export function HomeHero() {
  const { user, effectiveUiMode } = useAuth();
  const { t } = useTranslation();
  // Same create-order href as before (guest → login redirect).
  const createHref = user ? "/requests/new" : "/login?redirect=/requests/new";

  // Provider shell (provider-only or both in provider UI mode).
  if (user && effectiveUiMode === "provider") {
    return (
      <HomeHeroCard
        href="/search"
        title={t("home.findOrders")}
        subtitle={t("home.providerDesc")}
      />
    );
  }

  return (
    <HomeHeroCard
      href={createHref}
      title={t("home.createOrderBannerTitle")}
      subtitle={t("home.createOrderBannerSubtitle")}
    />
  );
}
