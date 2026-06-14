import { cn } from "@/lib/utils";
import type { RequestStatus, OfferStatus } from "@/types";

const requestStatusLabels: Record<RequestStatus, string> = {
  open: "Открыт",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

const requestStatusColors: Record<RequestStatus, string> = {
  open: "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

const offerStatusLabels: Record<OfferStatus, string> = {
  pending: "Ожидает",
  accepted: "Принят",
  rejected: "Отклонено",
  withdrawn: "Отозвано",
};

const offerStatusColors: Record<OfferStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

interface BadgeProps {
  status: RequestStatus | OfferStatus;
  type?: "request" | "offer";
  className?: string;
}

export function Badge({ status, type = "request", className }: BadgeProps) {
  const labels = type === "request" ? requestStatusLabels : offerStatusLabels;
  const colors = type === "request" ? requestStatusColors : offerStatusColors;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colors[status as keyof typeof colors],
        className
      )}
    >
      {labels[status as keyof typeof labels]}
    </span>
  );
}
