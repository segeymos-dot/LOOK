"use client";

import { cn } from "@/lib/utils";
import type { RequestStatus, OfferStatus } from "@/types";
import { useTranslation } from "@/components/providers/LocaleProvider";

const requestStatusStyles: Record<RequestStatus, string> = {
  open: "bg-success-bg text-emerald-700",
  in_progress: "bg-info-bg text-blue-700",
  pending_review: "bg-warning-bg text-amber-700",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-danger-bg text-red-700",
};

const requestStatusDots: Record<RequestStatus, string> = {
  open: "bg-emerald-500",
  in_progress: "bg-blue-500",
  pending_review: "bg-amber-500",
  completed: "bg-slate-400",
  cancelled: "bg-red-500",
};

const offerStatusStyles: Record<OfferStatus, string> = {
  pending: "bg-warning-bg text-amber-700",
  accepted: "bg-success-bg text-emerald-700",
  rejected: "bg-danger-bg text-red-700",
  withdrawn: "bg-slate-100 text-slate-600",
};

const offerStatusDots: Record<OfferStatus, string> = {
  pending: "bg-amber-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
  withdrawn: "bg-slate-400",
};

const offerStatusKeys: Record<OfferStatus, string> = {
  pending: "status.pending",
  accepted: "status.accepted",
  rejected: "status.rejected",
  withdrawn: "status.withdrawn",
};

interface BadgeProps {
  status: RequestStatus | OfferStatus;
  type?: "request" | "offer";
  className?: string;
  size?: "sm" | "md";
}

export function Badge({ status, type = "request", className, size = "sm" }: BadgeProps) {
  const { t } = useTranslation();
  const styles = type === "request" ? requestStatusStyles : offerStatusStyles;
  const dots = type === "request" ? requestStatusDots : offerStatusDots;
  const label =
    type === "request"
      ? t(`status.${status as RequestStatus}`)
      : t(offerStatusKeys[status as OfferStatus]);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        styles[status as keyof typeof styles],
        className
      )}
    >
      <span
        className={cn(
          "rounded-full",
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          dots[status as keyof typeof dots]
        )}
      />
      {label}
    </span>
  );
}
