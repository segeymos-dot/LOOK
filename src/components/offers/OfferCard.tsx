"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
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
  showActions = false,
  conversationId,
  acceptLoading,
  rejectLoading,
  onAccept,
  onReject,
}: OfferCardProps) {
  const href = `/requests/${requestId ?? offer.request_id}/offers/${offer.id}`;

  return (
    <Card className="overflow-hidden">
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
                  заказов · {offer.provider.reviews_count} отзывов
                </p>
              )}
            </div>
          </Link>
        ) : (
          <div />
        )}
        <Badge status={offer.status} type="offer" />
      </div>

      <Link href={href} className="block transition-opacity hover:opacity-95">
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-text-secondary">
          {offer.message}
        </p>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-lg font-bold text-brand-600">
            {formatPrice(offer.price, offer.currency)}
          </span>
          {offer.estimated_days && (
            <span className="text-text-muted">~{offer.estimated_days} дн.</span>
          )}
          <span className="text-text-muted">{formatRelativeTime(offer.created_at)}</span>
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
            Принять
          </Button>
          <Button
            className="flex-1"
            size="sm"
            variant="secondary"
            loading={rejectLoading}
            onClick={() => onReject?.(offer.id)}
          >
            Отклонить
          </Button>
        </div>
      )}

      {offer.status === "accepted" && conversationId && (
        <Link href={`/chat/${conversationId}`} className="mt-4 block">
          <Button size="sm" variant="outline" className="w-full gap-2">
            <MessageSquare className="h-4 w-4" />
            Открыть чат
          </Button>
        </Link>
      )}
    </Card>
  );
}
