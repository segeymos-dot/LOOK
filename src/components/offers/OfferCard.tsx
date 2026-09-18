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
  /** When true, rejected offers after selection show as “not selected”. */
  hasAcceptedOffer?: boolean;
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
  hasAcceptedOffer = false,
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
  const offerStatusLabel =
    offer.status === "rejected" && hasAcceptedOffer
      ? t("offer.notSelected")
      : undefined;

  return (
    <Card className="overflow-hidden" data-testid={`offer-card-${offer.id}`}>
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
          <Link href={`/providers/${offer.provider_id}`} className="flex min-w-0 items-center gap-3">
            <Avatar
              src={offer.provider.avatar_url}
              name={offer.provider.full_name}
              size="md"
              ring
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-primary hover:text-brand-600">
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
          {offerStatusLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              {offerStatusLabel}
            </span>
          ) : (
            <Badge status={offer.status} type="offer" />
          )}
        </div>
      </div>

      <Link href={href} className="block transition-opacity hover:opacity-95">
        <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-text-secondary">
          {localized.message}
        </p>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-lg font-bold text-brand-600">
            {formatPrice(offer.price, offer.currency)}
          </span>
          {offer.estimated_days && (
            <span className="text-text-muted">
              ~{offer.estimated_days} {t("offer.days")}
            </span>
          )}
          <span className="text-text-muted">
            {formatRelativeTimeT(offer.created_at, t, locale)}
          </span>
        </div>
      </Link>

      {/* Per-offer chat before and after selection (no group chat). */}
      {conversationId ? (
        <Link href={`/chat/${conversationId}`} className="mt-4 block">
          <Button size="sm" variant="outline" className="w-full gap-2">
            <MessageSquare className="h-4 w-4" />
            {t("offer.openChat")}
          </Button>
        </Link>
      ) : null}

      {showActions && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row">
          <Button
            className="w-full flex-1"
            size="lg"
            loading={acceptLoading}
            onClick={() => onAccept?.(offer.id)}
            data-testid="select-provider"
          >
            {t("offer.selectProvider")}
          </Button>
          <Button
            className="w-full flex-1"
            size="lg"
            variant="secondary"
            loading={rejectLoading}
            onClick={() => onReject?.(offer.id)}
          >
            {t("offer.reject")}
          </Button>
        </div>
      )}
    </Card>
  );
}
