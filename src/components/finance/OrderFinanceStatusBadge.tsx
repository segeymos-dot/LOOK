"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import type { OrderPaymentStatus, RefundDisputeStatus } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Payment/refund badge for an order.
 * An open dispute does NOT replace payment status — payment stays Paid until resolved.
 * After resolution, show the final payment outcome (Refunded / Completed), not open-dispute copy.
 * Provider-win (`refund_rejected`) defers to order payment status (typically Completed / Paid out).
 */
export type OrderFinanceDisplayStatus =
  | OrderPaymentStatus
  | Exclude<RefundDisputeStatus, "none" | "dispute_opened" | "refund_rejected">;

export function resolveOrderFinanceStatus(
  orderPaymentStatus?: OrderPaymentStatus | null,
  refundDisputeStatus?: RefundDisputeStatus | null
): OrderFinanceDisplayStatus {
  if (
    refundDisputeStatus === "refunded" ||
    refundDisputeStatus === "refund_pending"
  ) {
    return refundDisputeStatus;
  }
  // Provider win / reject: payment was released — show payment status, not "Refund rejected".
  if (refundDisputeStatus === "refund_rejected") {
    return orderPaymentStatus ?? "completed";
  }
  return orderPaymentStatus ?? "unpaid";
}

const styles: Record<OrderFinanceDisplayStatus | "dispute_opened", string> = {
  unpaid: "bg-slate-100 text-slate-700",
  payment_pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  completed: "bg-blue-100 text-blue-800",
  refunded: "bg-purple-100 text-purple-800",
  failed: "bg-red-100 text-red-800",
  refund_pending: "bg-amber-100 text-amber-800",
  dispute_opened: "bg-orange-100 text-orange-800",
};

const i18nKey: Record<OrderFinanceDisplayStatus | "dispute_opened", string> = {
  unpaid: "finance.orderPaymentStatus.unpaid",
  payment_pending: "finance.orderPaymentStatus.payment_pending",
  paid: "finance.orderPaymentStatus.paid",
  completed: "finance.orderPaymentStatus.completed",
  refunded: "finance.orderPaymentStatus.refunded",
  failed: "finance.orderPaymentStatus.failed",
  refund_pending: "finance.refundDisputeStatus.refund_pending",
  dispute_opened: "finance.refundDisputeStatus.dispute_opened",
};

interface OrderFinanceStatusBadgeProps {
  orderPaymentStatus?: OrderPaymentStatus | null;
  refundDisputeStatus?: RefundDisputeStatus | null;
  status?: OrderFinanceDisplayStatus;
  className?: string;
  /** When true (default), also show a persistent Dispute opened chip beside Paid. */
  showDisputeChip?: boolean;
}

export function OrderFinanceStatusBadge({
  orderPaymentStatus,
  refundDisputeStatus,
  status,
  className,
  showDisputeChip = true,
}: OrderFinanceStatusBadgeProps) {
  const { t } = useTranslation();
  const resolved =
    status ?? resolveOrderFinanceStatus(orderPaymentStatus, refundDisputeStatus);
  const disputeOpen =
    showDisputeChip && refundDisputeStatus === "dispute_opened";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          styles[resolved]
        )}
      >
        {t(i18nKey[resolved])}
      </span>
      {disputeOpen ? (
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
            styles.dispute_opened
          )}
        >
          {t(i18nKey.dispute_opened)}
        </span>
      ) : null}
    </span>
  );
}
