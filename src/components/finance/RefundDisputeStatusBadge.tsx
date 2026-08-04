"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import type { RefundDisputeStatus } from "@/types";
import { cn } from "@/lib/utils";

const styles: Record<Exclude<RefundDisputeStatus, "none">, string> = {
  refund_pending: "bg-amber-100 text-amber-800",
  refunded: "bg-purple-100 text-purple-800",
  dispute_opened: "bg-orange-100 text-orange-800",
  refund_rejected: "bg-red-100 text-red-800",
};

interface RefundDisputeStatusBadgeProps {
  status: RefundDisputeStatus;
  className?: string;
}

export function RefundDisputeStatusBadge({
  status,
  className,
}: RefundDisputeStatusBadgeProps) {
  const { t } = useTranslation();
  if (status === "none") return null;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[status],
        className
      )}
    >
      {t(`finance.refundDisputeStatus.${status}`)}
    </span>
  );
}
