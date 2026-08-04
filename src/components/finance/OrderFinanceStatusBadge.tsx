"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import type { OrderPaymentStatus, RefundDisputeStatus } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Single finance status for an order: payment / refund / dispute.
 * Prefer refund_dispute_status when active; otherwise order_payment_status.
 */
export type OrderFinanceDisplayStatus =
  | OrderPaymentStatus
  | Exclude<RefundDisputeStatus, "none">;

export function resolveOrderFinanceStatus(
  orderPaymentStatus?: OrderPaymentStatus | null,
  refundDisputeStatus?: RefundDisputeStatus | null
): OrderFinanceDisplayStatus {
  if (refundDisputeStatus && refundDisputeStatus !== "none") {
    return refundDisputeStatus;
  }
  return orderPaymentStatus ?? "unpaid";
}

const styles: Record<OrderFinanceDisplayStatus, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  payment_pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  completed: "bg-blue-100 text-blue-800",
  refunded: "bg-purple-100 text-purple-800",
  failed: "bg-red-100 text-red-800",
  refund_pending: "bg-amber-100 text-amber-800",
  dispute_opened: "bg-orange-100 text-orange-800",
  refund_rejected: "bg-red-100 text-red-800",
};

const i18nKey: Record<OrderFinanceDisplayStatus, string> = {
  unpaid: "finance.orderPaymentStatus.unpaid",
  payment_pending: "finance.orderPaymentStatus.payment_pending",
  paid: "finance.orderPaymentStatus.paid",
  completed: "finance.orderPaymentStatus.completed",
  refunded: "finance.orderPaymentStatus.refunded",
  failed: "finance.orderPaymentStatus.failed",
  refund_pending: "finance.refundDisputeStatus.refund_pending",
  dispute_opened: "finance.refundDisputeStatus.dispute_opened",
  refund_rejected: "finance.refundDisputeStatus.refund_rejected",
};

interface OrderFinanceStatusBadgeProps {
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  status?: OrderFinanceDisplayStatus;
  className?: string;
}

export function OrderFinanceStatusBadge({
  orderPaymentStatus,
  refundDisputeStatus,
  status,
  className,
}: OrderFinanceStatusBadgeProps) {
  const { t } = useTranslation();
  const resolved =
    status ?? resolveOrderFinanceStatus(orderPaymentStatus, refundDisputeStatus);

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[resolved],
        className
      )}
    >
      {t(i18nKey[resolved])}
    </span>
  );
}
