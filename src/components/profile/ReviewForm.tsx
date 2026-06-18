"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { StarPicker } from "@/components/profile/StarRating";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface ReviewFormProps {
  providerId: string;
  requestId: string;
  onSuccess?: () => void;
}

export function ReviewForm({ providerId, requestId, onSuccess }: ReviewFormProps) {
  const router = useRouter();
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
        body: JSON.stringify({ provider_id: providerId, request_id: requestId, rating, comment }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.error ?? "Не удалось отправить отзыв");
        return;
      }

      setDone(true);
      onSuccess?.();
      router.refresh();
    } catch {
      setError("Не удалось отправить отзыв");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card padding="md" className="border-emerald-200 bg-success-bg text-center">
        <p className="text-sm font-medium text-emerald-800">Спасибо! Отзыв отправлен.</p>
      </Card>
    );
  }

  return (
    <Card padding="md">
      <h3 className="mb-3 font-semibold text-text-primary">Оставить отзыв</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-text-secondary">Оценка</p>
          <StarPicker value={rating} onChange={setRating} />
        </div>
        <Textarea
          id="review-comment"
          label="Комментарий"
          rows={4}
          placeholder="Расскажите о работе исполнителя..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">
          Отправить отзыв
        </Button>
      </form>
    </Card>
  );
}
