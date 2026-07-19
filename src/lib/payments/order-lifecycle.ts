/**
 * Order payment lifecycle: unpaid → payment_pending → paid → completed
 *
 * Transitions are enforced in SQL (migration 024) and mirrored here for app-layer checks.
 */
import type { OrderPaymentStatus } from "@/types";

export const ORDER_PAYMENT_TRANSITIONS = {
  unpaid: ["payment_pending"],
  payment_pending: ["paid", "failed"],
  paid: ["completed", "refunded"],
  completed: [],
  refunded: [],
  failed: ["payment_pending", "unpaid"],
} as const satisfies Record<OrderPaymentStatus, readonly OrderPaymentStatus[]>;

export function isOrderPaymentPaid(status: OrderPaymentStatus | undefined): boolean {
  return status === "paid" || status === "completed";
}

export function isOrderPaymentCompleted(status: OrderPaymentStatus | undefined): boolean {
  return status === "completed";
}

export function canBeginCheckout(status: OrderPaymentStatus | undefined): boolean {
  return status === "unpaid" || status === "failed";
}
