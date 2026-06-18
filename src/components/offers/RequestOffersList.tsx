"use client";

import { OfferCard } from "@/components/offers/OfferCard";
import { ReviewForm } from "@/components/profile/ReviewForm";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { canDecideOnOffer, isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { canRespondToRequest, canActAsProvider } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";
import {
  getMockConversationForOffer,
  mockCurrentUser,
} from "@/lib/mock/data";
import { mapOfferActionError } from "@/lib/offers/offer-action-errors";
import type { Offer, RequestStatus } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

interface RequestOffersListProps {
  requestId: string;
  initialOffers: Offer[];
  initialRequestStatus: RequestStatus;
  customerId: string;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  viewerCanActAsProvider?: boolean;
  isDemo?: boolean;
  conversationByOfferId?: Record<string, string>;
}

export function RequestOffersList({
  requestId,
  initialOffers,
  initialRequestStatus,
  customerId,
  viewerUserId = null,
  viewerIsCustomer,
  viewerCanActAsProvider = false,
  isDemo = false,
  conversationByOfferId = {},
}: RequestOffersListProps) {
  const router = useRouter();
  const { user, loading: authLoading, isProvider, displayProfile } = useAuth();
  const [offers, setOffers] = useState(initialOffers);
  const [requestStatus, setRequestStatus] = useState(initialRequestStatus);
  const [conversations, setConversations] = useState(conversationByOfferId);
  const [offersLoading, setOffersLoading] = useState(false);
  const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"accept" | "reject" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isOwnerFromApi, setIsOwnerFromApi] = useState<boolean | null>(null);
  const [ownOfferId, setOwnOfferId] = useState<string | null>(null);
  const [ownOfferStatus, setOwnOfferStatus] = useState<string | null>(null);

  const activeUserId = user?.id ?? viewerUserId;
  const isRequestOwner =
    isOwnerFromApi ??
    checkRequestOwner({
      customerId,
      userId: activeUserId,
      viewerIsOwner: viewerIsCustomer,
      isDemo,
      demoUserId: mockCurrentUser.id,
    });

  const ownOffer = offers.find((offer) => offer.provider_id === activeUserId);
  const resolvedOwnOfferStatus = ownOffer?.status ?? ownOfferStatus;
  const resolvedOwnOfferId = ownOffer?.id ?? ownOfferId;

  const providerCapable =
    isProvider ||
    canActAsProvider(displayProfile?.role) ||
    viewerCanActAsProvider;

  const canRespond = canRespondToRequest({
    requestStatus,
    isRequestOwner,
    canActAsProvider: providerCapable,
    viewerUserId: activeUserId,
    customerId,
    ownOfferStatus: resolvedOwnOfferStatus,
  });

  useEffect(() => {
    setIsOwnerFromApi(null);
    setOwnOfferId(null);
    setOwnOfferStatus(null);
  }, [requestId, customerId]);

  const loadOffers = useCallback(async () => {
    if (isDemoMode() || isDemo) return;

    setOffersLoading(true);
    setError(null);

    try {
      const response = await authFetch(`/api/requests/${requestId}/offers`);

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        if (initialOffers.length === 0) {
          setError("Не удалось загрузить предложения");
        }
        return;
      }

      const result = await response.json();

      if (result.error && (!result.offers || result.offers.length === 0)) {
        setError(`Не удалось загрузить предложения: ${result.error}`);
        return;
      }

      if (Array.isArray(result.offers)) {
        setOffers(result.offers);
      }
      if (result.conversations) {
        setConversations(result.conversations);
      }
      if (typeof result.isCustomer === "boolean") {
        setIsOwnerFromApi(result.isCustomer);
      }
      if (result.ownOfferId !== undefined) {
        setOwnOfferId(result.ownOfferId);
      }
      if (result.ownOfferStatus !== undefined) {
        setOwnOfferStatus(result.ownOfferStatus);
      }
    } catch {
      if (initialOffers.length === 0) {
        setError("Не удалось загрузить предложения");
      }
    } finally {
      setOffersLoading(false);
    }
  }, [requestId, isDemo, initialOffers.length]);

  useEffect(() => {
    setRequestStatus(initialRequestStatus);
  }, [initialRequestStatus]);

  useEffect(() => {
    if (isDemoMode() || isDemo) return;
    if (authLoading) return;
    if (!user) return;
    loadOffers();
  }, [authLoading, user?.id, loadOffers, isDemo, user]);

  const handleAccept = async (offerId: string) => {
    setError(null);
    setLoadingOfferId(offerId);
    setLoadingAction("accept");

    try {
      if (isDemo) {
        const conversation =
          getMockConversationForOffer(offerId) ??
          ({ id: `conv-${offerId}` } as { id: string });

        setOffers((prev) =>
          prev.map((offer) => {
            if (offer.id === offerId) return { ...offer, status: "accepted" };
            if (offer.status === "pending") return { ...offer, status: "rejected" };
            return offer;
          })
        );
        setRequestStatus("in_progress");
        setConversations((prev) => ({ ...prev, [offerId]: conversation.id }));
        router.push(`/chat/${conversation.id}`);
        return;
      }

      const response = await authFetch(`/api/offers/${offerId}/accept`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          mapOfferActionError(result.error ?? "Не удалось принять предложение")
        );
        return;
      }

      setOffers((prev) =>
        prev.map((offer) => {
          if (offer.id === offerId) return { ...offer, status: "accepted" };
          if (offer.status === "pending") return { ...offer, status: "rejected" };
          return offer;
        })
      );
      setRequestStatus("in_progress");

      if (result.conversationId) {
        setConversations((prev) => ({
          ...prev,
          [offerId]: result.conversationId,
        }));
        router.push(`/chat/${result.conversationId}`);
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось принять предложение");
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };

  const handleReject = async (offerId: string) => {
    setError(null);
    setLoadingOfferId(offerId);
    setLoadingAction("reject");

    try {
      if (isDemo) {
        setOffers((prev) =>
          prev.map((offer) =>
            offer.id === offerId ? { ...offer, status: "rejected" } : offer
          )
        );
        return;
      }

      const response = await authFetch(`/api/offers/${offerId}/reject`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          mapOfferActionError(result.error ?? "Не удалось отклонить предложение")
        );
        return;
      }

      setOffers((prev) =>
        prev.map((offer) =>
          offer.id === offerId ? { ...offer, status: "rejected" } : offer
        )
      );
      router.refresh();
    } catch {
      setError("Не удалось отклонить предложение");
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };

  const acceptedOffer = offers.find((o) => o.status === "accepted");
  const activeConversationId =
    acceptedOffer && conversations[acceptedOffer.id]
      ? conversations[acceptedOffer.id]
      : null;
  const isAcceptedProvider =
    !!acceptedOffer && !!user?.id && user.id === acceptedOffer.provider_id;
  const showChatLink =
    requestStatus === "in_progress" &&
    !!activeConversationId &&
    (isRequestOwner || isAcceptedProvider);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="h-5 w-5" />
        Предложения ({offersLoading ? "…" : offers.length})
      </h2>

      {showChatLink && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm text-green-800">
            {isRequestOwner
              ? "Исполнитель выбран. Запрос в работе."
              : "Ваше предложение принято. Запрос в работе."}
          </p>
          <Link href={`/chat/${activeConversationId}`}>
            <Button size="sm">Открыть чат</Button>
          </Link>
        </div>
      )}

      {isRequestOwner && requestStatus === "completed" && acceptedOffer && (
        <div className="mb-4">
          <ReviewForm
            providerId={acceptedOffer.provider_id}
            requestId={requestId}
          />
        </div>
      )}

      {isRequestOwner &&
        providerCapable &&
        requestStatus === "open" &&
        activeUserId === customerId && (
          <p className="mb-4 rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
            Это ваш заказ. Управляйте им как заказчик. Откликнуться на свой заказ нельзя.
          </p>
        )}

      {canRespond && (
        <Link href={`/requests/${requestId}/offer`}>
          <Button className="mb-4 w-full">Откликнуться на заказ</Button>
        </Link>
      )}

      {!isRequestOwner && activeUserId && resolvedOwnOfferStatus === "pending" && (
        <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="mb-2">Вы уже отправили отклик. Ожидайте решения заказчика.</p>
          {resolvedOwnOfferId && (
            <Link href={`/requests/${requestId}/offers/${resolvedOwnOfferId}`}>
              <Button size="sm" variant="secondary">
                Посмотреть мой отклик
              </Button>
            </Link>
          )}
        </div>
      )}

      {!isRequestOwner && activeUserId && resolvedOwnOfferStatus === "rejected" && (
        <p className="mb-4 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600">
          Ваш предыдущий отклик отклонён. Вы можете отправить новый.
        </p>
      )}

      {isRequestOwner && requestStatus === "open" && offers.length === 0 && !offersLoading && (
        <p className="mb-4 text-center text-sm text-gray-500">
          Исполнители ещё не откликнулись на заказ
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {offersLoading && offers.length === 0 ? (
          <p className="py-6 text-center text-gray-500">Загрузка предложений…</p>
        ) : offers.length > 0 ? (
          offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              requestId={requestId}
              requestStatus={requestStatus}
              showActions={canDecideOnOffer({
                customerId,
                userId: user?.id ?? viewerUserId,
                viewerIsOwner:
                  isOwnerFromApi !== null ? isOwnerFromApi : viewerIsCustomer,
                requestStatus,
                offerStatus: offer.status,
                isDemo,
                demoUserId: mockCurrentUser.id,
              })}
              conversationId={conversations[offer.id]}
              acceptLoading={
                loadingOfferId === offer.id && loadingAction === "accept"
              }
              rejectLoading={
                loadingOfferId === offer.id && loadingAction === "reject"
              }
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))
        ) : (
          <p className="py-6 text-center text-gray-500">Пока нет предложений</p>
        )}
      </div>
    </section>
  );
}

export default RequestOffersList;
