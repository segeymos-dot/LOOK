"use client";

import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PaymentStatusChip } from "@/components/finance/PaymentStatusChip";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { localizeRequest } from "@/lib/i18n/localize-data";
import { formatPrice } from "@/lib/utils";
import type { Request } from "@/types";
import { MessageCircle, Calendar, MapPin } from "lucide-react";

interface RequestDetailCardProps {
  request: Request;
}

export function RequestDetailCard({ request }: RequestDetailCardProps) {
  const { t, locale } = useTranslation();
  const localized = localizeRequest(request, locale);

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="break-words text-xl font-bold tracking-tight text-text-primary line-clamp-3">
          {localized.title}
        </h1>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge status={request.status} size="md" />
          <PaymentStatusChip
            requestId={request.id}
            requestStatus={request.status}
            orderPaymentStatus={request.order_payment_status}
            refundDisputeStatus={request.refund_dispute_status ?? "none"}
          />
        </div>
      </div>

      {localized.category && (
        <div className="mb-4">
          <Chip>{localized.category.name}</Chip>
        </div>
      )}

      <p className="mb-5 leading-relaxed text-text-secondary">{localized.description}</p>

      <div className="mb-5 flex flex-wrap gap-4 text-sm">
        {request.status === "open" && (
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-brand-600" />
            <span className="font-medium text-brand-700">
              {request.offers_count ?? 0} {t("request.offersShort")}
            </span>
          </div>
        )}
        {request.budget_max && (
          <div>
            <p className="text-xs text-text-muted">{t("request.budget")}</p>
            <p className="font-bold text-text-primary">
              {t("request.budgetUpTo", {
                price: formatPrice(request.budget_max, request.currency),
              })}
            </p>
          </div>
        )}
        {localized.location && (
          <div className="flex items-center gap-1.5 text-text-secondary">
            <MapPin className="h-4 w-4 text-text-muted" />
            {localized.location}
          </div>
        )}
        {request.deadline && (
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Calendar className="h-4 w-4 text-text-muted" />
            {new Date(request.deadline).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU")}
          </div>
        )}
      </div>

      {localized.customer && (
        <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
          <Avatar
            src={localized.customer.avatar_url}
            name={localized.customer.full_name}
            size="md"
            ring
          />
          <div>
            <p className="text-xs text-text-muted">{t("request.customer")}</p>
            <p className="font-semibold text-text-primary">{localized.customer.full_name}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
