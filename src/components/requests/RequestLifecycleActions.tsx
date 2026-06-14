"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { mockCurrentUser } from "@/lib/mock/data";
import type { RequestStatus } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

function mapLifecycleError(message: string): string {
  if (message.includes("complete_request") && message.includes("schema cache")) {
    return "Функция complete_request не найдена в Supabase. Выполните supabase/migrations/009_request_lifecycle_rpc.sql в SQL Editor.";
  }
  if (message.includes("cancel_request") && message.includes("schema cache")) {
    return "Функция cancel_request не найдена в Supabase. Выполните supabase/migrations/009_request_lifecycle_rpc.sql в SQL Editor.";
  }
  if (message.includes("must be in progress")) {
    return "Завершить можно только запрос, который уже в работе.";
  }
  if (message.includes("cannot be cancelled")) {
    return "Этот запрос нельзя отменить в текущем статусе.";
  }
  if (message.includes("not found or not authorized")) {
    return "Нет прав для изменения статуса запроса.";
  }
  return message;
}

interface RequestLifecycleActionsProps {
  requestId: string;
  customerId: string;
  initialStatus: RequestStatus;
  isDemo?: boolean;
}

export function RequestLifecycleActions({
  requestId,
  customerId,
  initialStatus,
  isDemo = false,
}: RequestLifecycleActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState(initialStatus);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomer = isDemo
    ? mockCurrentUser.id === customerId
    : user?.id === customerId;

  if (!isCustomer) return null;

  const canComplete = status === "in_progress";
  const canCancel = status === "open" || status === "in_progress";

  if (!canComplete && !canCancel) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Статус запроса</p>
          <Badge status={status} />
        </div>
      </div>
    );
  }

  const handleComplete = async () => {
    setError(null);
    setCompleteLoading(true);

    try {
      if (isDemo) {
        setStatus("completed");
        router.refresh();
        return;
      }

      const response = await authFetch(`/api/requests/${requestId}/complete`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          mapLifecycleError(result.error ?? "Не удалось завершить запрос")
        );
        return;
      }

      setStatus(result.status);
      router.refresh();
    } catch {
      setError("Не удалось завершить запрос");
    } finally {
      setCompleteLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Отменить этот запрос?")) return;

    setError(null);
    setCancelLoading(true);

    try {
      if (isDemo) {
        setStatus("cancelled");
        router.refresh();
        return;
      }

      const response = await authFetch(`/api/requests/${requestId}/cancel`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(mapLifecycleError(result.error ?? "Не удалось отменить запрос"));
        return;
      }

      setStatus(result.status);
      router.refresh();
    } catch {
      setError("Не удалось отменить запрос");
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">Управление запросом</p>
        <Badge status={status} />
      </div>

      {status === "in_progress" && (
        <p className="mb-3 text-sm text-gray-600">
          Исполнитель назначен. Когда работа выполнена, отметьте запрос как завершённый.
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {canComplete && (
          <Button
            className="flex-1"
            loading={completeLoading}
            onClick={handleComplete}
          >
            Завершить заказ
          </Button>
        )}
        {canCancel && (
          <Button
            className="flex-1"
            variant="secondary"
            loading={cancelLoading}
            onClick={handleCancel}
          >
            Отменить
          </Button>
        )}
      </div>
    </div>
  );
}
