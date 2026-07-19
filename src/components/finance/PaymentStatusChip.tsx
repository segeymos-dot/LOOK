"use client";

import { useOrderPayment } from "@/hooks/useOrderPayment";
import { OrderPaymentStatusBadge } from "@/components/finance/OrderPaymentStatusBadge";
import { cn } from "@/lib/utils";
import type { OrderPaymentStatus, RequestStatus } from "@/types";

interface PaymentStatusChipProps {
  requestId: string;
  requestStatus: RequestStatus;
  orderPaymentStatus?: OrderPaymentStatus;
  className?: string;
}

export function PaymentStatusChip({
  requestId,
  requestStatus,
  orderPaymentStatus,
  className,
}: PaymentStatusChipProps) {
  const enabled =
    requestStatus === "in_progress" ||
    requestStatus === "pending_review" ||
    requestStatus === "completed";

  const { orderPaymentStatus: liveStatus, loading } = useOrderPayment(
    requestId,
    enabled && orderPaymentStatus == null
  );

  if (!enabled) return null;

  const status = orderPaymentStatus ?? liveStatus;

  if (orderPaymentStatus == null && loading) return null;

  if (status === "unpaid" && requestStatus === "completed") return null;

  return (
    <OrderPaymentStatusBadge
      status={status}
      className={cn(className)}
    />
  );
}
