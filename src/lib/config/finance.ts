/** Platform commission rate (15% default). Override via NEXT_PUBLIC_PLATFORM_COMMISSION_RATE */
export function getPlatformCommissionRate(): number {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_COMMISSION_RATE;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return 0.15;
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

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  order_payment: "Оплата заказа",
  platform_commission: "Комиссия LOOK",
  provider_earning: "Начисление исполнителю",
  provider_payout: "Выплата исполнителю",
  refund: "Возврат средств",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  paid: "Оплачен",
  failed: "Ошибка",
  refunded: "Возвращён",
};
