/**
 * Pure authorization checks for the simulated test-payment API.
 * Amount / status / commission from the client are never trusted.
 */

export type TestPaymentAuthzInput = {
  authenticatedUserId: string | null | undefined;
  orderCustomerId: string | null | undefined;
  orderStatus: string | null | undefined;
  orderPaymentStatus: string | null | undefined;
  existingPaymentStatus: string | null | undefined;
  /** Server-loaded expected gross (order_amount ?? accepted offer price). */
  expectedGrossAmount: number | null | undefined;
  /** Local/dev only: platform admin may simulate payment for any in-progress order. */
  isPlatformAdmin?: boolean;
};

export type TestPaymentAuthzResult =
  | { ok: true; expectedGrossAmount: number }
  | { ok: false; status: 401 | 403 | 400; error: string };

export function authorizeTestOrderPayment(
  input: TestPaymentAuthzInput
): TestPaymentAuthzResult {
  if (!input.authenticatedUserId) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (!input.orderCustomerId) {
    return { ok: false, status: 400, error: "Request not found" };
  }

  const isOwner = input.orderCustomerId === input.authenticatedUserId;
  if (!isOwner && !input.isPlatformAdmin) {
    return { ok: false, status: 403, error: "Not authorized" };
  }

  if (input.orderStatus !== "in_progress") {
    return {
      ok: false,
      status: 400,
      error: "Payment is only available for orders in progress",
    };
  }

  if (
    input.orderPaymentStatus === "paid" ||
    input.orderPaymentStatus === "completed" ||
    input.existingPaymentStatus === "paid"
  ) {
    return { ok: false, status: 400, error: "Order is already paid" };
  }

  const amount = Number(input.expectedGrossAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: "Invalid order amount" };
  }

  return { ok: true, expectedGrossAmount: amount };
}

export type TestPayoutAuthzInput = {
  authenticatedUserId: string | null | undefined;
  canActAsProvider: boolean;
};

export type TestPayoutAuthzResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

export function authorizeTestPayout(input: TestPayoutAuthzInput): TestPayoutAuthzResult {
  if (!input.authenticatedUserId) {
    return { ok: false, status: 401, error: "Authentication required" };
  }
  if (!input.canActAsProvider) {
    return { ok: false, status: 403, error: "Provider role required" };
  }
  return { ok: true };
}
