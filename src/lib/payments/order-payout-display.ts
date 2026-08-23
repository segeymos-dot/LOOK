import type { OrderPaymentStatus, OrderPayoutStatus } from "@/types";

/**
 * Display status for order-level payout in work/order history.
 *
 * After payment, LOOK credits provider_balances.available_balance immediately
 * while requests.payout_status often stays "pending" (external bank withdrawal).
 * Showing raw "pending" conflicts with available balance — map that case to "credited".
 */
export type OrderPayoutDisplayStatus =
  | "credited"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export function resolveOrderPayoutDisplayStatus(input: {
  orderPaymentStatus?: OrderPaymentStatus | null;
  payoutStatus?: OrderPayoutStatus | string | null;
}): OrderPayoutDisplayStatus | null {
  const pay = input.orderPaymentStatus;
  const payout = input.payoutStatus ?? null;

  if (pay !== "paid" && pay !== "completed") {
    return null;
  }

  if (payout === "completed") return "completed";
  if (payout === "processing") return "processing";
  if (payout === "failed") return "failed";
  if (payout === "cancelled") return "cancelled";

  // paid/completed + pending|null → funds already on available balance
  return "credited";
}
