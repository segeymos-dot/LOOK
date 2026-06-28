"use client";

import { Card } from "@/components/ui/Card";
import { StarRating } from "@/components/profile/StarRating";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { formatRating } from "@/lib/profile/provider-utils";
import { Briefcase, MessageSquare, Star } from "lucide-react";

interface ProviderStatsProps {
  rating: number;
  completedOrders: number;
  reviewsCount: number;
  variant?: "compact" | "full";
}

export function ProviderStats({
  rating,
  completedOrders,
  reviewsCount,
  variant = "full",
}: ProviderStatsProps) {
  const { t } = useTranslation();

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
        {rating > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            {formatRating(rating)}
          </span>
        )}
        <span>
          {completedOrders} {t("profile.stats.orders")}
        </span>
        <span>
          {reviewsCount} {t("profile.stats.reviews")}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <Card padding="sm" className="text-center">
        <Star className="mx-auto mb-1 h-5 w-5 text-amber-400" />
        <p className="text-lg font-bold text-text-primary">{formatRating(rating)}</p>
        <p className="text-xs text-text-muted">{t("profile.stats.rating")}</p>
        {rating > 0 && (
          <div className="mt-1 flex justify-center">
            <StarRating rating={rating} size="sm" />
          </div>
        )}
      </Card>
      <Card padding="sm" className="text-center">
        <Briefcase className="mx-auto mb-1 h-5 w-5 text-brand-600" />
        <p className="text-lg font-bold text-text-primary">{completedOrders}</p>
        <p className="text-xs text-text-muted">{t("profile.stats.completed")}</p>
      </Card>
      <Card padding="sm" className="text-center">
        <MessageSquare className="mx-auto mb-1 h-5 w-5 text-brand-600" />
        <p className="text-lg font-bold text-text-primary">{reviewsCount}</p>
        <p className="text-xs text-text-muted">{t("profile.stats.reviews")}</p>
      </Card>
    </div>
  );
}
