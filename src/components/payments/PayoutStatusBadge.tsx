"use client";

import { useTranslation } from "@/components/providers/LocaleProvider";
import type { PayoutUiStatus } from "@/lib/payments/billing-ui-state";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<PayoutUiStatus, string> = {
  not_connected: "bg-slate-100 text-slate-700",
  setup_required: "bg-amber-50 text-amber-900",
  pending_verification: "bg-sky-50 text-sky-900",
  ready: "bg-emerald-50 text-emerald-900",
  restricted: "bg-red-50 text-red-800",
};

export function PayoutStatusBadge({ status }: { status: PayoutUiStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-lg px-2.5 py-1 text-xs font-semibold",
        STATUS_CLASS[status]
      )}
      data-testid="payout-status-badge"
      data-status={status}
    >
      {t(`paymentsPayouts.payoutStatus.${status}`)}
    </span>
  );
}
