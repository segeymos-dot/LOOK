"use client";

import { OrderWorkLifecyclePanel } from "@/components/requests/OrderWorkLifecyclePanel";
import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getAuthenticatedUser } from "@/lib/auth/client-fetch";
import { canDecideOnOffer } from "@/lib/auth/viewer-role";
import { getMockConversationForOffer, mockCurrentUser } from "@/lib/mock/data";
import { mapOfferActionError } from "@/lib/offers/offer-action-errors";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import { formatPrice } from "@/lib/utils";
import type {
  Offer,
  OrderDispute,
  OrderPaymentStatus,
  RefundDisputeStatus,
  RequestStatus,
} from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface OfferDetailViewProps {
  initialOffer: Offer;
  requestId: string;
  customerId: string;
  initialRequestStatus: RequestStatus;
  initialConversationId?: string | null;
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  revisionFeedback?: string | null;
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  initialDispute?: OrderDispute | null;
  disputeFallbackReason?: string | null;
  isDemo?: boolean;
}

export function OfferDetailView({
  initialOffer,
  requestId,
  customerId,
  initialRequestStatus,
  initialConversationId = null,
  viewerUserId = null,
  viewerIsCustomer,
  revisionFeedback = null,
  orderPaymentStatus = null,
  refundDisputeStatus = "none",
  initialDispute = null,
  disputeFallbackReason = null,
  isDemo = false,
}: OfferDetailViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const [offer, setOffer] = useState(initialOffer);
  const [requestStatus, setRequestStatus] = useState(initialRequestStatus);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [clientUserId, setClientUserId] = useState<string | null>(viewerUserId);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) return;

    void getAuthenticatedUser().then((authenticatedUser) => {
      if (authenticatedUser?.id) {
        setClientUserId(authenticatedUser.id);
      }
    });
  }, [isDemo]);

  const activeUserId = user?.id ?? clientUserId ?? viewerUserId;
  const canDecide = canDecideOnOffer({
    customerId,
    userId: activeUserId,
    viewerIsCustomer,
    requestStatus,
    offerStatus: offer.status,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

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
        setError(mapOfferActionError(result.error ?? t("offer.acceptError")));
        return;
      }

      setOffer((current) => ({ ...current, status: "accepted" }));
      setRequestStatus("in_progress");

      if (result.conversationId) {
        setConversationId(result.conversationId);
        router.refresh();
        router.push(`/chat/${result.conversationId}`);
        return;
      }

      router.refresh();
    } catch {
      setError(t("offer.acceptError"));
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
        setError(mapOfferActionError(result.error ?? t("offer.rejectError")));
        return;
      }

      setOffer((current) => ({ ...current, status: "rejected" }));
      router.refresh();
    } catch {
      setError(t("offer.rejectError"));
    } finally {
      setRejectLoading(false);
    }
  };

  const isCustomer = activeUserId === customerId;

  return (
    <AppLayout activePath="/search" hideNav>
      <div className="space-y-6 p-4">
        <Link
          href={`/requests/${requestId}`}
          className="text-sm text-indigo-600"
        >
          ← {t("offer.backToRequest")}
        </Link>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold">{t("offer.detailTitle")}</h1>
            <Badge status={offer.status} type="offer" />
          </div>

          {offer.provider && (
            <Link
              href={`/providers/${offer.provider_id}`}
              className="mb-4 flex items-center gap-3 border-b border-border-subtle pb-4"
            >
              <Avatar
                src={offer.provider.avatar_url}
                name={offer.provider.full_name}
                size="lg"
                ring
              />
              <div>
                <p className="font-semibold text-text-primary hover:text-brand-600">
                  {offer.provider.full_name}
                </p>
                {offer.provider.rating > 0 && (
                  <p className="text-sm text-text-secondary">
                    ★ {offer.provider.rating.toFixed(1)} ·{" "}
                    {t("review.count", { count: offer.provider.reviews_count })} ·{" "}
                    {offer.provider.completed_orders_count} {t("profile.stats.orders")}
                  </p>
                )}
                {(offer.provider.city || offer.provider.country) && (
                  <p className="text-sm text-text-muted">
                    {[offer.provider.city, offer.provider.country].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </Link>
          )}

          <div className="mb-4">
            <p className="mb-1 text-sm text-gray-500">{t("offer.price")}</p>
            <p className="text-2xl font-bold text-indigo-600">
              {formatPrice(offer.price, offer.currency)}
            </p>
          </div>

          {offer.estimated_days && (
            <div className="mb-4">
              <p className="mb-1 text-sm text-gray-500">{t("offer.deadline")}</p>
              <p className="text-gray-900">
                ~{offer.estimated_days} {t("offer.days")}
              </p>
            </div>
          )}

          <div className="mb-4">
            <p className="mb-1 text-sm text-gray-500">{t("offer.message")}</p>
            <p className="whitespace-pre-wrap text-gray-700">{offer.message}</p>
          </div>

          <p className="text-sm text-gray-400">
            {t("offer.sentAt")} {formatRelativeTimeT(offer.created_at, t, locale)}
          </p>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {canDecide ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              loading={acceptLoading}
              onClick={handleAccept}
            >
              {t("offer.accept")}
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              loading={rejectLoading}
              onClick={handleReject}
            >
              {t("offer.reject")}
            </Button>
          </div>
        ) : null}

        {offer.status === "accepted" && conversationId && (
          <Link href={`/chat/${conversationId}`}>
            <Button className="w-full">{t("request.openChat")}</Button>
          </Link>
        )}

        {offer.status === "accepted" && (
          <OrderWorkLifecyclePanel
            requestId={requestId}
            customerId={customerId}
            requestStatus={requestStatus}
            grossAmount={Number(offer.price)}
            currency={offer.currency}
            acceptedProviderId={offer.provider_id}
            revisionFeedback={revisionFeedback}
            orderPaymentStatus={orderPaymentStatus}
            refundDisputeStatus={refundDisputeStatus}
            initialDispute={initialDispute}
            disputeFallbackReason={disputeFallbackReason}
            viewerUserId={activeUserId}
            viewerIsCustomer={isCustomer}
            isDemo={isDemo}
          />
        )}
      </div>
    </AppLayout>
  );
}
