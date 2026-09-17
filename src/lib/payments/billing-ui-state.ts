/**
 * Future-facing billing UI state (no Stripe SDK / no secrets).
 * Defaults match production today: no saved cards, payouts not connected.
 */

export type PaymentMethodUiStatus = "none" | "ready" | "default";

export type PayoutUiStatus =
  | "not_connected"
  | "setup_required"
  | "pending_verification"
  | "ready"
  | "restricted";

/** Placeholder shape for a future saved payment method (Stripe PaymentMethod id later). */
export type SavedPaymentMethodUi = {
  id: string;
  brandLabel: string;
  last4: string;
  status: Exclude<PaymentMethodUiStatus, "none">;
};

export type BillingUiSnapshot = {
  paymentMethods: SavedPaymentMethodUi[];
  payoutStatus: PayoutUiStatus;
};

/** Canonical production defaults until a real payment provider is activated. */
export function getDefaultBillingUiSnapshot(): BillingUiSnapshot {
  return {
    paymentMethods: [],
    payoutStatus: "not_connected",
  };
}

export function resolvePaymentMethodsStatus(
  methods: SavedPaymentMethodUi[]
): PaymentMethodUiStatus {
  if (methods.length === 0) return "none";
  if (methods.some((m) => m.status === "default")) return "default";
  return "ready";
}
