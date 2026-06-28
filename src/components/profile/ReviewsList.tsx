"use client";

import { Card } from "@/components/ui/Card";
import { StarRating } from "@/components/profile/StarRating";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import { localizeReview } from "@/lib/i18n/localize-data";
import type { Review } from "@/types";
import { formatRating } from "@/lib/profile/provider-utils";
import { Star } from "lucide-react";

interface ReviewCardProps {
  review: Review;
}

export function ReviewCard({ review }: ReviewCardProps) {
  const { t, locale } = useTranslation();
  const localized = localizeReview(review, locale);

  return (
    <Card padding="md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {localized.reviewer && (
            <Avatar
              src={localized.reviewer.avatar_url}
              name={localized.reviewer.full_name}
              size="sm"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {localized.reviewer?.full_name ?? t("review.client")}
            </p>
            <p className="text-xs text-text-muted">
              {formatRelativeTimeT(review.created_at, t, locale)}
            </p>
          </div>
        </div>
        <StarRating rating={review.rating} size="sm" />
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{localized.comment}</p>
    </Card>
  );
}

interface ReviewsListProps {
  reviews: Review[];
  title?: string;
  showSummary?: boolean;
  averageRating?: number;
}

export function ReviewsList({
  reviews,
  title,
  showSummary = false,
  averageRating = 0,
}: ReviewsListProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("review.clientReviews");

  if (reviews.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{resolvedTitle}</h2>
        <Card padding="md" className="text-center">
          <p className="text-sm text-text-muted">{t("review.empty")}</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{resolvedTitle}</h2>
        {showSummary && averageRating > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-bold text-text-primary">{formatRating(averageRating)}</span>
            <span className="text-xs text-text-muted">
              · {t("review.count", { count: reviews.length })}
            </span>
          </div>
        )}
      </div>
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </section>
  );
}
