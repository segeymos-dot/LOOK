"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { getMockConversationForOffer, mockCurrentUser } from "@/lib/mock/data";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import type { Offer, RequestStatus } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function mapOfferActionError(message: string): string {
  if (message.includes("accept_offer") && message.includes("schema cache")) {
    return "Функция accept_offer не найдена в Supabase. Выполните supabase/migrations/008_deploy_offer_rpc.sql в SQL Editor.";
  }
  if (message.includes("Offer not found, not pending, or not authorized")) {
    return "Предложение недоступно: уже обработано или нет прав.";
  }
  return message;
}

interface OfferDetailViewProps {
  initialOffer: Offer;
  requestId: string;
  customerId: string;
  initialRequestStatus: RequestStatus;
  initialConversationId?: string | null;
  isDemo?: boolean;
}

export function OfferDetailView({
  initialOffer,
  requestId,
  customerId,
  initialRequestStatus,
  initialConversationId = null,
  isDemo = false,
}: OfferDetailViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [offer, setOffer] = useState(initialOffer);
  const [requestStatus, setRequestStatus] = useState(initialRequestStatus);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomer = isDemo
    ? mockCurrentUser.id === customerId
    : user?.id === customerId;
  const canDecide =
    isCustomer && requestStatus === "open" && offer.status === "pending";

  const handleAccept = async () => {
    setError(null);
    setAcceptLoading(true);

    try {
      if (isDemo) {
        const conversation =
          getMockConversationForOffer(offer.id) ??
          ({ id: `conv-${offer.id}` } as { id: string });

        setOffer((current) => ({ ...current, status: "accepted" }));
        setRequestStatus("in_progress");
        setConversationId(conversation.id);
        router.push(`/chat/${conversation.id}`);
        return;
      }

      const response = await authFetch(`/api/offers/${offer.id}/accept`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(mapOfferActionError(result.error ?? "Не удалось принять предложение"));
        return;
      }

      setOffer((current) => ({ ...current, status: "accepted" }));
      setRequestStatus("in_progress");

      if (result.conversationId) {
        setConversationId(result.conversationId);
        router.push(`/chat/${result.conversationId}`);
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось принять предложение");
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleReject = async () => {
    setError(null);
    setRejectLoading(true);

    try {
      if (isDemo) {
        setOffer((current) => ({ ...current, status: "rejected" }));
        return;
      }

      const response = await authFetch(`/api/offers/${offer.id}/reject`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(mapOfferActionError(result.error ?? "Не удалось отклонить предложение"));
        return;
      }

      setOffer((current) => ({ ...current, status: "rejected" }));
      router.refresh();
    } catch {
      setError("Не удалось отклонить предложение");
    } finally {
      setRejectLoading(false);
    }
  };

  return (
    <AppLayout activePath="/search" hideNav>
      <div className="space-y-6 p-4">
        <Link
          href={`/requests/${requestId}`}
          className="text-sm text-indigo-600"
        >
          ← Назад к заказу
        </Link>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold">Предложение исполнителя</h1>
            <Badge status={offer.status} type="offer" />
          </div>

          {offer.provider && (
            <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
              <Avatar
                src={offer.provider.avatar_url}
                name={offer.provider.full_name}
                size="lg"
              />
              <div>
                <p className="font-medium text-gray-900">
                  {offer.provider.full_name}
                </p>
                {offer.provider.rating > 0 && (
                  <p className="text-sm text-gray-500">
                    ★ {offer.provider.rating.toFixed(1)} ·{" "}
                    {offer.provider.reviews_count} отзывов
                  </p>
                )}
                {(offer.provider.city || offer.provider.country) && (
                  <p className="text-sm text-gray-500">
                    {[offer.provider.city, offer.provider.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <p className="mb-1 text-sm text-gray-500">Предлагаемая цена</p>
            <p className="text-2xl font-bold text-indigo-600">
              {formatPrice(offer.price, offer.currency)}
            </p>
          </div>

          {offer.estimated_days && (
            <div className="mb-4">
              <p className="mb-1 text-sm text-gray-500">Срок выполнения</p>
              <p className="text-gray-900">~{offer.estimated_days} дн.</p>
            </div>
          )}

          <div className="mb-4">
            <p className="mb-1 text-sm text-gray-500">Сообщение</p>
            <p className="whitespace-pre-wrap text-gray-700">{offer.message}</p>
          </div>

          <p className="text-sm text-gray-400">
            Отправлено {formatRelativeTime(offer.created_at)}
          </p>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {canDecide && (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              loading={acceptLoading}
              onClick={handleAccept}
            >
              Принять предложение
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              loading={rejectLoading}
              onClick={handleReject}
            >
              Отклонить
            </Button>
          </div>
        )}

        {offer.status === "accepted" && conversationId && (
          <Link href={`/chat/${conversationId}`}>
            <Button className="w-full">Открыть чат</Button>
          </Link>
        )}
      </div>
    </AppLayout>
  );
}
