"use client";

import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import { localizeOffer } from "@/lib/i18n/localize-data";
import { formatPrice } from "@/lib/utils";
import type { Offer, RequestStatus } from "@/types";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

interface OfferCardProps {
  offer: Offer;
  requestId?: string;
  requestStatus?: RequestStatus;
  showActions?: boolean;
  conversationId?: string | null;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
  onAccept?: (offerId: string) => void;
  onReject?: (offerId: string) => void;
}

export function OfferCard({
  offer,
  requestId,
  requestStatus,
  showActions = false,
  conversationId,
  acceptLoading,
  rejectLoading,
  onAccept,
  onReject,
}: OfferCardProps) {
  const { t, locale } = useTranslation();
  const localized = localizeOffer(offer, locale);
  const href = `/requests/${requestId ?? offer.request_id}/offers/${offer.id}`;
  const resolvedRequestStatus = requestStatus ?? offer.request?.status;

  return (
    <Card className="overflow-hidden">
      {localized.request?.title && (
        <Link
          href={`/requests/${offer.request_id}`}
          className="mb-3 block text-sm font-semibold text-text-primary line-clamp-2 hover:text-brand-600"
        >
          {localized.request.title}
        </Link>
      )}
      <div className="mb-3 flex items-start justify-between gap-3">
        {offer.provider ? (
          <Link href={`/providers/${offer.provider_id}`} className="flex items-center gap-3">
            <Avatar
              src={offer.provider.avatar_url}
              name={offer.provider.full_name}
              size="md"
              ring
            />
            <div>
              <p className="font-semibold text-text-primary hover:text-brand-600">
                {offer.provider.full_name}
              </p>
              {offer.provider.rating > 0 && (
                <p className="text-xs text-text-secondary">
                  ★ {offer.provider.rating.toFixed(1)} · {offer.provider.completed_orders_count}{" "}
                  {t("profile.stats.orders")} · {t("review.count", { count: offer.provider.reviews_count })}
                </p>
              )}
            </div>
          </Link>
        ) : (
          <div />
        )}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {resolvedRequestStatus && (
            <Badge status={resolvedRequestStatus} size="sm" />
          )}
          <Badge status={offer.status} type="offer" />
        </div>
      </div>

      <Link href={href} className="block transition-opacity hover:opacity-95">
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-text-secondary">
          {localized.message}
        </p>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-lg font-bold text-brand-600">
            {formatPrice(offer.price, offer.currency)}
          </span>
          {offer.estimated_days && (
            <span className="text-text-muted">
              ~{offer.estimated_days} {t("offer.days")}
            </span>
          )}
          <span className="text-text-muted">{formatRelativeTimeT(offer.created_at, t, locale)}</span>
        </div>
      </Link>

      {showActions && (
        <div className="mt-4 flex gap-2 border-t border-border-subtle pt-4">
          <Button
            className="flex-1"
            size="sm"
            loading={acceptLoading}
            onClick={() => onAccept?.(offer.id)}
          >
            {t("offer.accept")}
          </Button>
          <Button
            className="flex-1"
            size="sm"
            variant="secondary"
            loading={rejectLoading}
            onClick={() => onReject?.(offer.id)}
          >
            {t("offer.reject")}
          </Button>
        </div>
      )}

      {offer.status === "accepted" && conversationId && (
        <Link href={`/chat/${conversationId}`} className="mt-4 block">
          <Button size="sm" variant="outline" className="w-full gap-2">
            <MessageSquare className="h-4 w-4" />
            {t("request.openChat")}
          </Button>
        </Link>
      )}
    </Card>
  );
}
