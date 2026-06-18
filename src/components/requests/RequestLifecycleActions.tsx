"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { mockCurrentUser } from "@/lib/mock/data";
import { getDemoPaymentForRequest } from "@/lib/mock/finance";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
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
  if (message.includes("must be paid")) {
    return "Сначала проведите тестовую оплату заказа.";
  }
  if (message.includes("not found or not authorized")) {
    return "Нет прав для изменения статуса запроса.";
  }
  if (message.includes("simulate_test_payment") && message.includes("schema cache")) {
    return "Функция simulate_test_payment не найдена. Выполните supabase/migrations/012_financial_core.sql в SQL Editor.";
  }
  return message;
}

interface RequestLifecycleActionsProps {
  requestId: string;
  customerId: string;
  initialStatus: RequestStatus;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  isDemo?: boolean;
}

export function RequestLifecycleActions({
  requestId,
  customerId,
  initialStatus,
  viewerUserId = null,
  viewerIsCustomer,
  isDemo = false,
}: RequestLifecycleActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState(initialStatus);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRequestOwner = checkRequestOwner({
    customerId,
    userId: user?.id ?? viewerUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

  if (!isRequestOwner) return null;

  const canComplete = status === "in_progress";
  const canCancel = status === "open" || status === "in_progress";

  if (!canComplete && !canCancel) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">Статус запроса</p>
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
        if (!getDemoPaymentForRequest(requestId)) {
          setError("Сначала проведите тестовую оплату заказа.");
          return;
        }
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
    <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">Управление запросом</p>
        <Badge status={status} />
      </div>

      {status === "in_progress" && (
        <p className="mb-3 text-sm text-text-secondary">
          Исполнитель назначен. Когда работа выполнена, отметьте запрос как завершённый.
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-danger-bg px-4 py-2 text-sm text-danger">
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
