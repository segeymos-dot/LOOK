"use client";

import { OfferCard } from "@/components/offers/OfferCard";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/auth/client-fetch";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser } from "@/lib/mock/data";
import type { Offer, RequestStatus } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

interface RequestOffersListProps {
  requestId: string;
  initialOffers: Offer[];
  initialRequestStatus: RequestStatus;
  customerId: string;
  isDemo?: boolean;
  conversationByOfferId?: Record<string, string>;
}

export function RequestOffersList({
  requestId,
  initialOffers,
  initialRequestStatus,
  customerId,
  isDemo = false,
  conversationByOfferId = {},
}: RequestOffersListProps) {
  const { user, loading: authLoading } = useAuth();
  const [offers, setOffers] = useState(initialOffers);
  const [requestStatus] = useState(initialRequestStatus);
  const [conversations, setConversations] = useState(conversationByOfferId);
  const [offersLoading, setOffersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomer = isDemo
    ? mockCurrentUser.id === customerId
    : user?.id === customerId;

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
    } catch {
      if (initialOffers.length === 0) {
        setError("Не удалось загрузить предложения");
      }
    } finally {
      setOffersLoading(false);
    }
  }, [requestId, isDemo, initialOffers.length]);

  useEffect(() => {
    if (isDemoMode() || isDemo) return;
    if (authLoading) return;
    if (!user) return;
    loadOffers();
  }, [authLoading, user?.id, loadOffers, isDemo, user]);

  const acceptedOffer = offers.find((o) => o.status === "accepted");
  const activeConversationId =
    acceptedOffer && conversations[acceptedOffer.id]
      ? conversations[acceptedOffer.id]
      : null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="h-5 w-5" />
        Предложения ({offersLoading ? "…" : offers.length})
      </h2>

      {requestStatus === "in_progress" && isCustomer && activeConversationId && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm text-green-800">
            Исполнитель выбран. Запрос в работе.
          </p>
          <Link href={`/chat/${activeConversationId}`}>
            <Button size="sm">Открыть чат с исполнителем</Button>
          </Link>
        </div>
      )}

      <Link href={`/requests/${requestId}/offer`}>
        <Button className="mb-4 w-full">Откликнуться на заказ</Button>
      </Link>

      {isCustomer && requestStatus === "open" && offers.length === 0 && !offersLoading && (
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
            <OfferCard key={offer.id} offer={offer} requestId={requestId} />
          ))
        ) : (
          <p className="py-6 text-center text-gray-500">Пока нет предложений</p>
        )}
      </div>
    </section>
  );
}

export default RequestOffersList;
