/** Platform commission rate (10% default). Override via NEXT_PUBLIC_PLATFORM_COMMISSION_RATE */
export function getPlatformCommissionRate(): number {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_COMMISSION_RATE;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return 0.10;
}

export function formatCommissionPercent(rate = getPlatformCommissionRate()): string {
  return `${Math.round(rate * 100)}%`;
}

export function calculatePaymentSplit(grossAmount: number, rate = getPlatformCommissionRate()) {
  const gross = Math.round(grossAmount * 100) / 100;
  const platformFee = Math.round(gross * rate * 100) / 100;
  const providerAmount = Math.round((gross - platformFee) * 100) / 100;
  return { gross, platformFee, providerAmount, rate };
}

/** @deprecated Use i18n finance.transactionType.* via ledger codes. */
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  order_payment: "order_payment",
  platform_commission: "platform_commission",
  provider_earning: "provider_earning",
  provider_payout: "provider_payout",
  refund: "customer_refund",
  customer_refund: "customer_refund",
  provider_earning_reversal: "provider_earning_reversal",
  platform_commission_reversal: "platform_commission_reversal",
  provider_payout_reversal: "provider_payout_reversal",
  dispute_opened: "dispute_opened",
  dispute_resolved: "dispute_resolved",
};

/** @deprecated Use i18n finance.paymentStatus.* */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "pending",
  paid: "paid",
  failed: "failed",
  refunded: "refunded",
};
