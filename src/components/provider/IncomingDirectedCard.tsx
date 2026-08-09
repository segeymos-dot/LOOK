"use client";

import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { IncomingDirectedRequest } from "@/lib/data/incoming-directed-requests";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import { localizeCategoryName, localizeText } from "@/lib/i18n/localize-data";
import { formatPrice } from "@/lib/utils";
import Link from "next/link";
import { MapPin } from "lucide-react";

interface IncomingDirectedCardProps {
  item: IncomingDirectedRequest;
}

function inboxStatusLabel(
  t: (key: string) => string,
  status: IncomingDirectedRequest["inbox_status"]
) {
  switch (status) {
    case "new":
      return t("incoming.statusNew");
    case "offer_sent":
      return t("incoming.statusOfferSent");
    case "in_progress":
      return t("incoming.statusInProgress");
    case "closed":
      return t("incoming.statusClosed");
    default:
      return status;
  }
}

export function IncomingDirectedCard({ item }: IncomingDirectedCardProps) {
  const { t, locale } = useTranslation();
  const title = localizeText(item.title, locale);
  const budget =
    item.budget_max != null
      ? formatPrice(item.budget_max, item.currency)
      : item.budget_min != null
        ? formatPrice(item.budget_min, item.currency)
        : null;

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-bold tracking-tight text-text-primary">
            {title}
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {inboxStatusLabel(t, item.inbox_status)}
          </p>
        </div>
        <Badge status={item.status} />
      </div>

      {item.customer && (
        <div className="flex items-center gap-2">
          <Avatar
            src={item.customer.avatar_url}
            name={item.customer.full_name}
            size="sm"
          />
          <span className="truncate text-sm font-medium text-text-secondary">
            {item.customer.full_name}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {item.category && (
          <Chip>{localizeCategoryName(item.category, locale)}</Chip>
        )}
        {budget && (
          <span className="text-sm font-bold text-text-primary">
            {t("request.budgetUpTo", { price: budget })}
          </span>
        )}
        {item.location && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <MapPin className="h-3.5 w-3.5" />
            {localizeText(item.location, locale)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <span className="text-xs text-text-muted">
          {formatRelativeTimeT(item.created_at, t, locale)}
        </span>
        <Link href={`/requests/${item.request_id}`}>
          <Button size="sm">{t("incoming.openRequest")}</Button>
        </Link>
      </div>
    </Card>
  );
}
