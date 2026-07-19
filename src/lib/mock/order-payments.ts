import type { OrderPaymentStatus, OrderPayoutStatus } from "@/types";

type MockOrderPayment = {
  order_payment_status: OrderPaymentStatus;
  order_amount: number;
  look_commission: number;
  provider_payout_amount: number;
  currency: string;
  payment_provider_name: string | null;
  payment_transaction_id: string | null;
  payout_status: OrderPayoutStatus;
  paid_at: string | null;
  customer_id: string;
  provider_id: string;
  request_title: string;
  payment_id?: string;
};

const mockOrderPayments = new Map<string, MockOrderPayment>();

export function initDemoOrderPayment(input: {
  requestId: string;
  customerId: string;
  providerId: string;
  orderAmount: number;
  currency: string;
  requestTitle: string;
}) {
  const rate = 0.1;
  const fee = Math.round(input.orderAmount * rate * 100) / 100;
  const providerAmount = Math.round((input.orderAmount - fee) * 100) / 100;

  mockOrderPayments.set(input.requestId, {
    order_payment_status: "unpaid",
    order_amount: input.orderAmount,
    look_commission: fee,
    provider_payout_amount: providerAmount,
    currency: input.currency,
    payment_provider_name: null,
    payment_transaction_id: null,
    payout_status: "pending",
    paid_at: null,
    customer_id: input.customerId,
    provider_id: input.providerId,
    request_title: input.requestTitle,
  });
}

export function getMockOrderPayment(requestId: string): MockOrderPayment | null {
  return mockOrderPayments.get(requestId) ?? null;
}

export function setMockOrderPaymentPending(requestId: string) {
  const row = mockOrderPayments.get(requestId);
  if (row && row.order_payment_status === "unpaid") {
    mockOrderPayments.set(requestId, { ...row, order_payment_status: "payment_pending" });
  }
}

export function markMockOrderPaid(
  requestId: string,
  transactionId: string
): MockOrderPayment | null {
  const row = mockOrderPayments.get(requestId);
  if (!row) return null;
  if (row.order_payment_status === "paid" || row.order_payment_status === "completed") {
    return row;
  }
  const next: MockOrderPayment = {
    ...row,
    order_payment_status: "paid",
    payment_provider_name: "look_test",
    payment_transaction_id: transactionId,
    paid_at: new Date().toISOString(),
    payment_id: `pay-demo-${requestId}`,
  };
  mockOrderPayments.set(requestId, next);
  return next;
}

/** Idempotent: paid → completed when customer accepts work. */
export function markMockOrderCompleted(requestId: string): MockOrderPayment | null {
  const row = mockOrderPayments.get(requestId);
  if (!row) return null;
  if (row.order_payment_status === "completed") {
    return row;
  }
  const next: MockOrderPayment = {
    ...row,
    order_payment_status: "completed",
  };
  mockOrderPayments.set(requestId, next);
  return next;
}

export function getDemoPaymentHistory(userId: string) {
  const entries: Array<{
    id: string;
    request_id: string;
    request_title: string;
    role: "customer" | "provider";
    amount_gross: number;
    platform_fee: number;
    provider_amount: number;
    currency: string;
    payment_status: "paid";
    order_payment_status: OrderPaymentStatus;
    payment_provider_name: string | null;
    payment_transaction_id: string | null;
    payout_status: OrderPayoutStatus;
    paid_at: string | null;
    created_at: string;
  }> = [];

  for (const [requestId, row] of mockOrderPayments) {
    if (row.order_payment_status !== "paid" && row.order_payment_status !== "completed") {
      continue;
    }
    const role =
      row.customer_id === userId ? "customer" : row.provider_id === userId ? "provider" : null;
    if (!role) continue;

    entries.push({
      id: row.payment_id ?? `pay-demo-${requestId}`,
      request_id: requestId,
      request_title: row.request_title,
      role,
      amount_gross: row.order_amount,
      platform_fee: row.look_commission,
      provider_amount: row.provider_payout_amount,
      currency: row.currency,
      payment_status: "paid",
      order_payment_status: row.order_payment_status,
      payment_provider_name: row.payment_provider_name,
      payment_transaction_id: row.payment_transaction_id,
      paid_at: row.paid_at,
      payout_status: row.payout_status,
      created_at: row.paid_at ?? new Date().toISOString(),
    });
  }

  return entries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
