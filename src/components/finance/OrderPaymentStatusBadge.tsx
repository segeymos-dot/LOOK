"use client";

import {
  OrderFinanceStatusBadge,
  resolveOrderFinanceStatus,
} from "@/components/finance/OrderFinanceStatusBadge";
import type { OrderPaymentStatus, RefundDisputeStatus } from "@/types";

interface OrderPaymentStatusBadgeProps {
  status: OrderPaymentStatus;
  refundDisputeStatus?: RefundDisputeStatus | null;
  className?: string;
}

/** @deprecated Prefer OrderFinanceStatusBadge — kept for compatibility. */
export function OrderPaymentStatusBadge({
  status,
  refundDisputeStatus = "none",
  className,
}: OrderPaymentStatusBadgeProps) {
  return (
    <OrderFinanceStatusBadge
      orderPaymentStatus={status}
      refundDisputeStatus={refundDisputeStatus}
      status={resolveOrderFinanceStatus(status, refundDisputeStatus)}
      className={className}
    />
  );
}
