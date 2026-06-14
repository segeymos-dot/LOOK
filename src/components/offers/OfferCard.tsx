"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import type { Offer } from "@/types";
import Link from "next/link";

interface OfferCardProps {
  offer: Offer;
  requestId?: string;
}

export function OfferCard({ offer, requestId }: OfferCardProps) {
  const href = `/requests/${requestId ?? offer.request_id}/offers/${offer.id}`;

  return (
    <Link
      href={href}
      className="block cursor-pointer rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {offer.provider && (
            <>
              <Avatar
                src={offer.provider.avatar_url}
                name={offer.provider.full_name}
              />
              <div>
                <p className="font-medium text-gray-900">
                  {offer.provider.full_name}
                </p>
                {offer.provider.rating > 0 && (
                  <p className="text-sm text-gray-500">
                    ★ {offer.provider.rating.toFixed(1)} (
                    {offer.provider.reviews_count})
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <Badge status={offer.status} type="offer" />
      </div>

      <p className="mb-3 line-clamp-2 text-sm text-gray-700">{offer.message}</p>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-lg font-bold text-indigo-600">
          {formatPrice(offer.price, offer.currency)}
        </span>
        {offer.estimated_days && (
          <span className="text-gray-500">~{offer.estimated_days} дн.</span>
        )}
        <span className="text-gray-400">{formatRelativeTime(offer.created_at)}</span>
      </div>
    </Link>
  );
}
