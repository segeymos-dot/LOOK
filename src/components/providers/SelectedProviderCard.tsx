"use client";

import { ProviderProfileLink } from "@/components/providers/ProviderProfileLink";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { Profile } from "@/types";

interface SelectedProviderCardProps {
  providerId: string;
  provider?: Pick<
    Profile,
    "full_name" | "avatar_url" | "rating" | "reviews_count" | "completed_orders_count"
  > | null;
}

/** Compact order-context card linking to the public provider profile. */
export function SelectedProviderCard({
  providerId,
  provider,
}: SelectedProviderCardProps) {
  const { t } = useTranslation();
  const name = provider?.full_name?.trim() || t("role.provider");

  return (
    <Card padding="md" className="mb-4 border-brand-100 bg-brand-50/60">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
        {t("provider.selectedTitle")}
      </p>
      <ProviderProfileLink
        providerId={providerId}
        className="flex items-center gap-3"
      >
        <Avatar src={provider?.avatar_url} name={name} size="md" ring />
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-700 hover:underline">
            {name}
          </p>
          {provider && Number(provider.rating) > 0 ? (
            <p className="text-xs text-text-secondary">
              ★ {Number(provider.rating).toFixed(1)}
              {provider.reviews_count > 0
                ? ` · ${t("review.count", { count: provider.reviews_count })}`
                : ""}
              {` · ${t("provider.completedOrders", {
                count: provider.completed_orders_count ?? 0,
              })}`}
            </p>
          ) : (
            <p className="text-xs text-text-secondary">{t("role.provider")}</p>
          )}
        </div>
      </ProviderProfileLink>
    </Card>
  );
}
