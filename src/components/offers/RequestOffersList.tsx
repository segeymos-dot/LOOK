"use client";

import { OfferCard } from "@/components/offers/OfferCard";
import { ReviewForm } from "@/components/profile/ReviewForm";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
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
  hideProviderRespond?: boolean;
  onOffersChange?: (offers: Offer[]) => void;
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
  hideProviderRespond = false,
  onOffersChange,
}: RequestOffersListProps) {
  const router = useRouter();
  const { user, loading: authLoading, isProvider, displayProfile } = useAuth();
  const { t } = useTranslation();
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
          setError(t("offer.loadError"));
        }
        return;
      }

      const result = await response.json();

      if (result.error && (!result.offers || result.offers.length === 0)) {
        setError(`${t("offer.loadError")}: ${result.error}`);
        return;
      }

      if (Array.isArray(result.offers)) {
        setOffers(result.offers);
        onOffersChange?.(result.offers);
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
        setError(t("offer.loadError"));
      }
    } finally {
      setOffersLoading(false);
    }
  }, [requestId, isDemo, initialOffers.length, onOffersChange, t]);

  useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

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
        setError(mapOfferActionError(result.error ?? t("offer.acceptError")));
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
      setError(t("offer.acceptError"));
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
        setError(mapOfferActionError(result.error ?? t("offer.rejectError")));
        return;
      }

      setOffers((prev) =>
        prev.map((offer) =>
          offer.id === offerId ? { ...offer, status: "rejected" } : offer
        )
      );
      router.refresh();
    } catch {
      setError(t("offer.rejectError"));
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
    (requestStatus === "in_progress" ||
      requestStatus === "pending_review" ||
      requestStatus === "completed") &&
    !!activeConversationId &&
    (isRequestOwner || isAcceptedProvider);

  const chatStatusMessage = (() => {
    if (requestStatus === "pending_review" && isRequestOwner) {
      return t("request.pendingReviewCustomer");
    }
    if (isRequestOwner) {
      return t("request.inProgressCustomer");
    }
    if (requestStatus === "pending_review") {
      return t("request.pendingReviewProvider");
    }
    return t("request.inProgressProvider");
  })();

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="h-5 w-5" />
        {t("offer.sectionTitle")} ({offersLoading ? "…" : offers.length})
      </h2>

      {showChatLink && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm text-green-800">{chatStatusMessage}</p>
          <Link href={`/chat/${activeConversationId}`}>
            <Button size="sm">{t("request.openChat")}</Button>
          </Link>
        </div>
      )}

      {isRequestOwner && requestStatus === "completed" && acceptedOffer && (
        <div className="mb-4">
          <ReviewForm
            revieweeId={acceptedOffer.provider_id}
            requestId={requestId}
            title={t("review.rateProvider")}
            placeholder={t("offer.providerPlaceholder")}
          />
        </div>
      )}

      {isAcceptedProvider && requestStatus === "completed" && (
        <div className="mb-4">
          <ReviewForm
            revieweeId={customerId}
            requestId={requestId}
            title={t("review.rateCustomer")}
            placeholder={t("offer.customerPlaceholder")}
          />
        </div>
      )}

      {isRequestOwner &&
        providerCapable &&
        requestStatus === "open" &&
        activeUserId === customerId && (
          <p className="mb-4 rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
            {t("request.manageTitle")}
          </p>
        )}

      {canRespond && !hideProviderRespond && (
        <Link href={`/requests/${requestId}/offer`}>
          <Button className="mb-4 w-full">{t("offer.respond")}</Button>
        </Link>
      )}

      {!hideProviderRespond &&
        !isRequestOwner &&
        activeUserId &&
        resolvedOwnOfferStatus === "pending" && (
        <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="mb-2">{t("offer.alreadyResponded")}</p>
          {resolvedOwnOfferId && (
            <Link href={`/requests/${requestId}/offers/${resolvedOwnOfferId}`}>
              <Button size="sm" variant="secondary">
                {t("offer.detailTitle")}
              </Button>
            </Link>
          )}
        </div>
      )}

      {!hideProviderRespond &&
        !isRequestOwner &&
        activeUserId &&
        resolvedOwnOfferStatus === "rejected" && (
        <p className="mb-4 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600">
          {t("status.rejected")}
        </p>
      )}

      {isRequestOwner && requestStatus === "open" && offers.length === 0 && !offersLoading && (
        <p className="mb-4 text-center text-sm text-gray-500">{t("offer.noOffersDesc")}</p>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {offersLoading && offers.length === 0 ? (
          <p className="py-6 text-center text-gray-500">{t("common.loading")}</p>
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
          <p className="py-6 text-center text-gray-500">{t("offer.noOffers")}</p>
        )}
      </div>
    </section>
  );
}

export default RequestOffersList;
