import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import type { Request } from "@/types";
import { ChevronRight, MapPin, MessageCircle } from "lucide-react";

interface RequestCardProps {
  request: Request;
}

export function RequestCard({ request }: RequestCardProps) {
  return (
    <Link href={`/requests/${request.id}`} className="group block">
      <Card className="transition-all duration-200 group-hover:border-brand-200 group-hover:shadow-elevated">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 flex-1 text-base font-bold tracking-tight text-text-primary group-hover:text-brand-700">
            {request.title}
          </h3>
          <Badge status={request.status} />
        </div>

        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-text-secondary">
          {request.description}
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {request.category && <Chip>{request.category.name}</Chip>}
          {request.budget_max && (
            <span className="text-sm font-bold text-text-primary">
              до {formatPrice(request.budget_max, request.currency)}
            </span>
          )}
          {request.location && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <MapPin className="h-3.5 w-3.5" />
              {request.location}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle pt-3">
          <div className="flex items-center gap-2">
            {request.customer && (
              <>
                <Avatar
                  src={request.customer.avatar_url}
                  name={request.customer.full_name}
                  size="sm"
                />
                <span className="text-sm font-medium text-text-secondary">
                  {request.customer.full_name}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700"
              title="Количество откликов"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {request.offers_count ?? 0}
            </span>
            <span>{formatRelativeTime(request.created_at)}</span>
            <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
