"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import type { OrderPaymentStatus } from "@/types";
import { cn } from "@/lib/utils";

const styles: Record<OrderPaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  payment_pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  completed: "bg-blue-100 text-blue-800",
  refunded: "bg-purple-100 text-purple-800",
  failed: "bg-red-100 text-red-800",
};

interface OrderPaymentStatusBadgeProps {
  status: OrderPaymentStatus;
  className?: string;
}

export function OrderPaymentStatusBadge({ status, className }: OrderPaymentStatusBadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        styles[status],
        className
      )}
    >
      {t(`finance.orderPaymentStatus.${status}`)}
    </span>
  );
}
