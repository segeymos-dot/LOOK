import type { OrderPaymentStatus, RequestStatus } from "@/types";

export type LifecycleBannerViewer = "customer" | "provider";

function isPaidStatus(payment: OrderPaymentStatus | null | undefined): boolean {
  return payment === "paid" || payment === "completed";
}

/**
 * Lifecycle helper text for order/chat banners.
 * Returns null when no lifecycle plaque should be shown (e.g. completed — badge is enough).
 */
export function getLifecycleBannerMessageKey(input: {
  requestStatus: RequestStatus;
  orderPaymentStatus?: OrderPaymentStatus | null;
  viewer: LifecycleBannerViewer;
}): string | null {
  const { requestStatus, orderPaymentStatus, viewer } = input;
  const paid = isPaidStatus(orderPaymentStatus);

  if (
    requestStatus === "completed" ||
    requestStatus === "cancelled" ||
    requestStatus === "open"
  ) {
    return null;
  }

  if (requestStatus === "pending_review") {
    return viewer === "customer"
      ? "request.pendingReviewCustomer"
      : "request.pendingReviewProvider";
  }

  if (requestStatus === "in_progress") {
    if (viewer === "customer") {
      return paid
        ? "request.inProgressCustomerPaid"
        : "request.inProgressCustomer";
    }
    return paid
      ? "request.inProgressProviderPaid"
      : "request.inProgressProvider";
  }

  return null;
}
