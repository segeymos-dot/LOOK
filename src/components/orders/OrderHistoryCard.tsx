"use client";

import { OrderFinanceStatusBadge } from "@/components/finance/OrderFinanceStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import type { OrderHistoryItem } from "@/lib/orders/history-types";
import { formatPrice } from "@/lib/utils";
import { MessageCircle, Star } from "lucide-react";
import Link from "next/link";

function formatWhen(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function OrderHistoryCard({
  item,
  viewer,
  onArchive,
}: {
  item: OrderHistoryItem;
  viewer: "customer" | "provider" | "admin";
  onArchive?: (id: string, archived: boolean) => void;
}) {
  const { t, locale } = useTranslation();
  const amount = item.agreed_amount ?? item.budget_max;
  const labelKey = `orderHistory.labels.${item.history_label}`;
  const label = t(labelKey);
  const displayLabel = label === labelKey ? item.history_label : label;

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-bold text-text-primary">
            {item.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.category_name ? <Chip>{item.category_name}</Chip> : null}
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-secondary">
              {displayLabel}
            </span>
            {item.is_test ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {t("orderHistory.testMarker")}
              </span>
            ) : null}
          </div>
        </div>
        <Badge status={item.status} />
      </div>

      <div className="grid gap-1 text-sm text-text-secondary">
        <p>
          <span className="text-text-muted">{t("orderHistory.customer")}: </span>
          {item.customer_name ?? "—"}
        </p>
        <p>
          <span className="text-text-muted">{t("orderHistory.provider")}: </span>
          {item.provider_name ?? t("orderHistory.noProvider")}
        </p>
        {item.offer_status && viewer === "provider" ? (
          <p>
            <span className="text-text-muted">{t("orderHistory.offerStatus")}: </span>
            {t(`status.${item.offer_status}`)}
          </p>
        ) : null}
        <p>
          <span className="text-text-muted">{t("orderHistory.agreedAmount")}: </span>
          {amount != null ? formatPrice(amount, item.currency) : "—"}
        </p>
        {item.location ? (
          <p>
            <span className="text-text-muted">{t("orderHistory.location")}: </span>
            {item.location}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <OrderFinanceStatusBadge
          orderPaymentStatus={item.order_payment_status}
          refundDisputeStatus={item.refund_dispute_status}
        />
        {item.payout_status && viewer !== "customer" ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {t("orderHistory.payout")}: {item.payout_status}
          </span>
        ) : null}
        {item.review_status !== "none" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            <Star className="h-3.5 w-3.5" />
            {t(`orderHistory.review.${item.review_status}`)}
          </span>
        ) : (
          <span className="text-xs text-text-muted">
            {t("orderHistory.review.none")}
          </span>
        )}
      </div>

      <div className="space-y-0.5 text-xs text-text-muted">
        <p>
          {t("orderHistory.dates.created")}:{" "}
          {formatWhen(item.created_at, locale) ??
            formatRelativeTimeT(item.created_at, t, locale)}
        </p>
        {item.accepted_at ? (
          <p>
            {t("orderHistory.dates.accepted")}: {formatWhen(item.accepted_at, locale)}
          </p>
        ) : null}
        {item.paid_at ? (
          <p>
            {t("orderHistory.dates.paid")}: {formatWhen(item.paid_at, locale)}
          </p>
        ) : null}
        {item.work_submitted_at ? (
          <p>
            {t("orderHistory.dates.submitted")}:{" "}
            {formatWhen(item.work_submitted_at, locale)}
          </p>
        ) : null}
        {item.completed_at ? (
          <p>
            {t("orderHistory.dates.completed")}: {formatWhen(item.completed_at, locale)}
          </p>
        ) : null}
        {item.cancelled_at ? (
          <p>
            {t("orderHistory.dates.cancelled")}: {formatWhen(item.cancelled_at, locale)}
          </p>
        ) : null}
        {item.refunded_at ? (
          <p>
            {t("orderHistory.dates.refunded")}: {formatWhen(item.refunded_at, locale)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/requests/${item.id}`}>
          <Button size="sm">{t("orderHistory.openOrder")}</Button>
        </Link>
        {item.conversation_id ? (
          <Link href={`/chat/${item.conversation_id}`}>
            <Button size="sm" variant="outline" className="gap-1">
              <MessageCircle className="h-4 w-4" />
              {t("orderHistory.openChat")}
            </Button>
          </Link>
        ) : null}
        {item.dispute_id && viewer === "admin" ? (
          <Link href={`/admin/disputes/${item.dispute_id}`}>
            <Button size="sm" variant="outline">
              {t("orderHistory.openDispute")}
            </Button>
          </Link>
        ) : null}
        {onArchive ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchive(item.id, !item.archived_at)}
          >
            {item.archived_at
              ? t("orderHistory.restore")
              : t("orderHistory.archive")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
