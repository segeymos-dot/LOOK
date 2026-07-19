/**
 * Payment provider identifiers.
 */
export const PAYMENT_PROVIDER = {
  /** Mock / test checkout — no real card charges */
  LOOK_TEST: "look_test",
  /** Stripe Checkout / PaymentIntent */
  STRIPE: "stripe",
} as const;

export type PaymentProviderName = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];
