import { Card } from "@/components/ui/Card";
import { StarRating } from "@/components/profile/StarRating";
import { Avatar } from "@/components/ui/Avatar";
import type { Review } from "@/types";
import { formatRating } from "@/lib/profile/provider-utils";
import { formatRelativeTime } from "@/lib/utils";
import { Star } from "lucide-react";

interface ReviewCardProps {
  review: Review;
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <Card padding="md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {review.reviewer && (
            <Avatar
              src={review.reviewer.avatar_url}
              name={review.reviewer.full_name}
              size="sm"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {review.reviewer?.full_name ?? "Клиент"}
            </p>
            <p className="text-xs text-text-muted">{formatRelativeTime(review.created_at)}</p>
          </div>
        </div>
        <StarRating rating={review.rating} size="sm" />
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{review.comment}</p>
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
  title = "Отзывы клиентов",
  showSummary = false,
  averageRating = 0,
}: ReviewsListProps) {
  if (reviews.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
        <Card padding="md" className="text-center">
          <p className="text-sm text-text-muted">Пока нет отзывов</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
        {showSummary && averageRating > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-bold text-text-primary">{formatRating(averageRating)}</span>
            <span className="text-xs text-text-muted">· {reviews.length} отзывов</span>
          </div>
        )}
      </div>
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </section>
  );
}
