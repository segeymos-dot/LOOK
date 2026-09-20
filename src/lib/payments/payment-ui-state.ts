import type { OrderPaymentStatus } from "@/types";

export type PaymentUiState =
  | "test"
  | "unavailable"
  | "live_unpaid"
  | "paid"
  | "completed";

export type PaymentUiStateInput = {
  /** Canonical DB flag. Absence of Stripe must never imply test. */
  isTest: boolean;
  stripeConfigured: boolean;
  paymentStatus?: OrderPaymentStatus | string | null;
};

/**
 * Single payment UI contract. Do not duplicate these branches in components.
 * Stripe-off is "unavailable", not "test".
 */
export function getPaymentUiState(input: PaymentUiStateInput): PaymentUiState {
  const pay = (input.paymentStatus ?? "unpaid").toString();

  if (pay === "completed") return "completed";
  if (pay === "paid") return "paid";

  if (input.isTest) return "test";
  if (!input.stripeConfigured) return "unavailable";
  return "live_unpaid";
}
