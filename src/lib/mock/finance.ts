import { calculatePaymentSplit, getPlatformCommissionRate } from "@/lib/config/finance";
import type {
  FinanceTransaction,
  Payment,
  PaymentSimulationResult,
  PlatformSummary,
  ProviderBalance,
} from "@/types";

type DemoPaymentRecord = Payment & { commission_rate: number };

const demoPayments = new Map<string, DemoPaymentRecord>();
const demoTransactions: FinanceTransaction[] = [];
const demoProviderBalances = new Map<string, ProviderBalance>();
const demoPlatformTotals = {
  total_commission: 0,
  paid_orders_count: 0,
  gross_volume: 0,
  currency: "USD",
};

function txId() {
  return `tx-demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getDemoPaymentForRequest(requestId: string): Payment | null {
  return demoPayments.get(requestId) ?? null;
}

export function simulateDemoPayment(input: {
  requestId: string;
  offerId: string;
  customerId: string;
  providerId: string;
  grossAmount: number;
  currency?: string;
}): PaymentSimulationResult {
  const existing = demoPayments.get(input.requestId);
  if (existing?.status === "paid") {
    throw new Error("Order already paid");
  }

  const rate = getPlatformCommissionRate();
  const { gross, platformFee, providerAmount } = calculatePaymentSplit(input.grossAmount, rate);
  const currency = input.currency ?? "USD";
  const now = new Date().toISOString();
  const paymentId = `pay-demo-${input.requestId}`;

  const payment: DemoPaymentRecord = {
    id: paymentId,
    request_id: input.requestId,
    offer_id: input.offerId,
    customer_id: input.customerId,
    provider_id: input.providerId,
    amount_gross: gross,
    platform_fee: platformFee,
    provider_amount: providerAmount,
    currency,
    status: "paid",
    payment_method: "test",
    paid_at: now,
    created_at: now,
    commission_rate: rate,
  };

  demoPayments.set(input.requestId, payment);

  const entries: FinanceTransaction[] = [
    {
      id: txId(),
      payment_id: paymentId,
      payout_id: null,
      request_id: input.requestId,
      user_id: input.customerId,
      provider_id: null,
      type: "order_payment",
      amount: gross,
      currency,
      status: "completed",
      description: "Тестовая оплата заказа",
      created_at: now,
    },
    {
      id: txId(),
      payment_id: paymentId,
      payout_id: null,
      request_id: input.requestId,
      user_id: null,
      provider_id: null,
      type: "platform_commission",
      amount: platformFee,
      currency,
      status: "completed",
      description: "Комиссия LOOK",
      created_at: now,
    },
    {
      id: txId(),
      payment_id: paymentId,
      payout_id: null,
      request_id: input.requestId,
      user_id: input.providerId,
      provider_id: input.providerId,
      type: "provider_earning",
      amount: providerAmount,
      currency,
      status: "completed",
      description: "Начисление исполнителю",
      created_at: now,
    },
  ];

  demoTransactions.unshift(...entries);

  const prev =
    demoProviderBalances.get(input.providerId) ??
    ({
      provider_id: input.providerId,
      available_balance: 0,
      pending_payout: 0,
      total_earned: 0,
      currency,
      updated_at: now,
    } satisfies ProviderBalance);

  demoProviderBalances.set(input.providerId, {
    ...prev,
    available_balance: prev.available_balance + providerAmount,
    total_earned: prev.total_earned + providerAmount,
    updated_at: now,
  });

  demoPlatformTotals.total_commission += platformFee;
  demoPlatformTotals.paid_orders_count += 1;
  demoPlatformTotals.gross_volume += gross;

  return {
    payment_id: paymentId,
    request_id: input.requestId,
    amount_gross: gross,
    platform_fee: platformFee,
    provider_amount: providerAmount,
    commission_rate: rate,
    currency,
    status: "paid",
  };
}

export function getDemoProviderBalance(providerId: string): ProviderBalance {
  const now = new Date().toISOString();
  return (
    demoProviderBalances.get(providerId) ?? {
      provider_id: providerId,
      available_balance: 0,
      pending_payout: 0,
      total_earned: 0,
      currency: "USD",
      updated_at: now,
    }
  );
}

export function getDemoPlatformSummary(): PlatformSummary {
  return {
    commission_rate: getPlatformCommissionRate(),
    total_commission: demoPlatformTotals.total_commission,
    paid_orders_count: demoPlatformTotals.paid_orders_count,
    gross_volume: demoPlatformTotals.gross_volume,
    currency: demoPlatformTotals.currency,
  };
}

export function getDemoTransactionsForUser(userId: string, isAdmin: boolean): FinanceTransaction[] {
  if (isAdmin) return [...demoTransactions];
  return demoTransactions.filter(
    (t) => t.user_id === userId || t.provider_id === userId
  );
}

export function simulateDemoPayout(providerId: string, amount?: number) {
  const balance = getDemoProviderBalance(providerId);
  if (balance.available_balance <= 0) throw new Error("No available balance for payout");

  const payoutAmount = amount ?? balance.available_balance;
  if (payoutAmount <= 0 || payoutAmount > balance.available_balance) {
    throw new Error("Invalid payout amount");
  }

  const now = new Date().toISOString();
  const payoutId = `payout-demo-${Date.now()}`;

  demoProviderBalances.set(providerId, {
    ...balance,
    available_balance: balance.available_balance - payoutAmount,
    updated_at: now,
  });

  demoTransactions.unshift({
    id: txId(),
    payment_id: null,
    payout_id: payoutId,
    request_id: null,
    user_id: providerId,
    provider_id: providerId,
    type: "provider_payout",
    amount: payoutAmount,
    currency: balance.currency,
    status: "completed",
    description: "Тестовая выплата исполнителю",
    created_at: now,
  });

  return { payout_id: payoutId, amount: payoutAmount, currency: balance.currency, status: "completed" };
}

/** Reset demo finance state (for tests) */
export function resetDemoFinance() {
  demoPayments.clear();
  demoTransactions.length = 0;
  demoProviderBalances.clear();
  demoPlatformTotals.total_commission = 0;
  demoPlatformTotals.paid_orders_count = 0;
  demoPlatformTotals.gross_volume = 0;
}
