"use client";

import { useOrderPayment } from "@/hooks/useOrderPayment";
import { OrderFinanceStatusBadge } from "@/components/finance/OrderFinanceStatusBadge";
import { cn } from "@/lib/utils";
import type { OrderPaymentStatus, RefundDisputeStatus, RequestStatus } from "@/types";

interface PaymentStatusChipProps {
  requestId: string;
  requestStatus: RequestStatus;
  orderPaymentStatus?: OrderPaymentStatus;
  refundDisputeStatus?: RefundDisputeStatus | null;
  className?: string;
}

export function PaymentStatusChip({
  requestId,
  requestStatus,
  orderPaymentStatus,
  refundDisputeStatus = "none",
  className,
}: PaymentStatusChipProps) {
  const enabled =
    requestStatus === "in_progress" ||
    requestStatus === "pending_review" ||
    requestStatus === "completed" ||
    requestStatus === "cancelled";

  const { orderPaymentStatus: liveStatus, loading } = useOrderPayment(
    requestId,
    enabled && orderPaymentStatus == null
  );

  if (!enabled) return null;

  const status = orderPaymentStatus ?? liveStatus;

  if (orderPaymentStatus == null && loading) return null;

  if (status === "unpaid" && requestStatus === "completed") return null;
  if (
    status === "unpaid" &&
    requestStatus === "cancelled" &&
    (!refundDisputeStatus || refundDisputeStatus === "none")
  ) {
    return null;
  }

  return (
    <OrderFinanceStatusBadge
      orderPaymentStatus={status}
      refundDisputeStatus={refundDisputeStatus}
      className={cn(className)}
    />
  );
}
