"use client";

import { HomeHeroCard } from "@/components/home/HomeHeroCard";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";

export function HomeHero() {
  const { user, effectiveUiMode, isPlatformAdmin } = useAuth();
  const { t } = useTranslation();
  // Same create-order href as before (guest → login redirect).
  const createHref = user ? "/requests/new" : "/login?redirect=/requests/new";

  // Platform admin: surfer banner → Admin panel (same route as Profile CTA).
  // Must not expose create-order navigation for this role.
  if (isPlatformAdmin) {
    return (
      <HomeHeroCard
        variant="admin"
        href="/admin/stats"
        adminCtaLabel={t("profile.adminPanel")}
      />
    );
  }

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
