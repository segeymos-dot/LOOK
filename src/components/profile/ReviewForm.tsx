"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { StarPicker } from "@/components/profile/StarRating";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface ReviewFormProps {
  revieweeId: string;
  requestId: string;
  title?: string;
  placeholder?: string;
  onSuccess?: () => void;
}

export function ReviewForm({
  revieweeId,
  requestId,
  title,
  placeholder,
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
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isDemoMode()) {
        setDone(true);
        onSuccess?.();
        return;
      }

      const response = await authFetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewee_id: revieweeId, request_id: requestId, rating, comment }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.error ?? t("common.error"));
        return;
      }

      setDone(true);
      onSuccess?.();
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card padding="md" className="border-emerald-200 bg-success-bg text-center">
        <p className="text-sm font-medium text-emerald-800">{t("review.thanks")}</p>
      </Card>
    );
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
