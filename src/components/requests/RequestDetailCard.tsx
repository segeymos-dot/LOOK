import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { formatPrice } from "@/lib/utils";
import type { Request } from "@/types";
import { Calendar, MapPin } from "lucide-react";

interface RequestDetailCardProps {
  request: Request;
}

export function RequestDetailCard({ request }: RequestDetailCardProps) {
  return (
    <Card padding="lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">{request.title}</h1>
        <Badge status={request.status} size="md" />
      </div>

      {request.category && (
        <div className="mb-4">
          <Chip>{request.category.name}</Chip>
        </div>
      )}

      <p className="mb-5 leading-relaxed text-text-secondary">{request.description}</p>

      <div className="mb-5 flex flex-wrap gap-4 text-sm">
        {request.budget_max && (
          <div>
            <p className="text-xs text-text-muted">Бюджет</p>
            <p className="font-bold text-text-primary">
              до {formatPrice(request.budget_max, request.currency)}
            </p>
          </div>
        )}
        {request.location && (
          <div className="flex items-center gap-1.5 text-text-secondary">
            <MapPin className="h-4 w-4 text-text-muted" />
            {request.location}
          </div>
        )}
        {request.deadline && (
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Calendar className="h-4 w-4 text-text-muted" />
            {new Date(request.deadline).toLocaleDateString("ru-RU")}
          </div>
        )}
      </div>

      {request.customer && (
        <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
          <Avatar
            src={request.customer.avatar_url}
            name={request.customer.full_name}
            size="md"
            ring
          />
          <div>
            <p className="text-xs text-text-muted">Заказчик</p>
            <p className="font-semibold text-text-primary">{request.customer.full_name}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
