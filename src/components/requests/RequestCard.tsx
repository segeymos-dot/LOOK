import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import type { Request } from "@/types";
import { MessageCircle } from "lucide-react";

interface RequestCardProps {
  request: Request;
}

export function RequestCard({ request }: RequestCardProps) {
  return (
    <Link
      href={`/requests/${request.id}`}
      className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-semibold text-gray-900">{request.title}</h3>
        <Badge status={request.status} />
      </div>

      <p className="mb-3 line-clamp-2 text-sm text-gray-600">{request.description}</p>

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {request.category && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-700">
            {request.category.name}
          </span>
        )}
        {request.budget_max && (
          <span className="font-medium text-gray-900">
            до {formatPrice(request.budget_max, request.currency)}
          </span>
        )}
        {request.location && (
          <span className="text-gray-500">{request.location}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {request.customer && (
            <>
              <Avatar
                src={request.customer.avatar_url}
                name={request.customer.full_name}
                size="sm"
              />
              <span className="text-sm text-gray-600">{request.customer.full_name}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          {request.offers_count !== undefined && request.offers_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              {request.offers_count}
            </span>
          )}
          <span>{formatRelativeTime(request.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
