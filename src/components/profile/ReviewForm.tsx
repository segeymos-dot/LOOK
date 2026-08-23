"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { StarPicker, StarRating } from "@/components/profile/StarRating";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export type SubmittedReviewView = {
  rating: number;
  comment: string;
};

interface ReviewFormProps {
  revieweeId: string;
  requestId: string;
  title?: string;
  placeholder?: string;
  existingReview?: SubmittedReviewView | null;
  onSuccess?: (review: SubmittedReviewView) => void;
}

function SubmittedReviewCard({
  title,
  review,
}: {
  title: string;
  review: SubmittedReviewView;
}) {
  const { t } = useTranslation();

  return (
    <Card padding="md" className="border-emerald-200 bg-success-bg">
      <h3 className="mb-1 font-semibold text-text-primary">{title}</h3>
      <p className="mb-3 text-sm text-emerald-800">{t("review.thanks")}</p>
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-sm font-medium text-text-primary">{t("review.rating")}</p>
          <StarRating rating={review.rating} size="md" showValue />
        </div>
        {review.comment.trim() ? (
          <div>
            <p className="mb-1 text-sm font-medium text-text-primary">{t("review.comment")}</p>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{review.comment}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function ReviewForm({
  revieweeId,
  requestId,
  title,
  placeholder,
  existingReview = null,
  onSuccess,
}: ReviewFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("review.title");
  const resolvedPlaceholder = placeholder ?? t("review.comment");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedReview, setSubmittedReview] = useState<SubmittedReviewView | null>(
    existingReview
  );

  useEffect(() => {
    if (existingReview) {
      setSubmittedReview(existingReview);
    }
  }, [existingReview]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittedReview) return;

    setError(null);
    setLoading(true);

    const nextReview: SubmittedReviewView = { rating, comment };

    try {
      if (isDemoMode()) {
        setSubmittedReview(nextReview);
        onSuccess?.(nextReview);
        return;
      }

      const response = await authFetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewee_id: revieweeId, request_id: requestId, rating, comment }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status === 409) {
          setSubmittedReview(nextReview);
          onSuccess?.(nextReview);
          router.refresh();
          return;
        }
        setError(result.error ?? t("common.error"));
        return;
      }

      const saved: SubmittedReviewView = {
        rating: result.review?.rating ?? rating,
        comment: result.review?.comment ?? comment,
      };
      setSubmittedReview(saved);
      onSuccess?.(saved);
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (submittedReview) {
    return <SubmittedReviewCard title={resolvedTitle} review={submittedReview} />;
  }

  return (
    <Card padding="md">
      <h3 className="mb-3 font-semibold text-text-primary">{resolvedTitle}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">{t("review.rating")}</p>
          <StarPicker value={rating} onChange={setRating} />
        </div>
        <Textarea
          id="review-comment"
          label={t("review.comment")}
          rows={4}
          placeholder={resolvedPlaceholder}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">
          {t("review.submit")}
        </Button>
      </form>
    </Card>
  );
}
