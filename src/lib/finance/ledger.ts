import type { TransactionType } from "@/types";

/** Stable ledger codes stored in DB (never localized prose). */
export const LEDGER_CODES = [
  "order_payment",
  "provider_earning",
  "platform_commission",
  "customer_refund",
  "provider_earning_reversal",
  "platform_commission_reversal",
  "provider_payout",
  "provider_payout_reversal",
  "dispute_opened",
  "dispute_resolved",
] as const;

export type LedgerCode = (typeof LEDGER_CODES)[number];

const LEGACY_TYPE_TO_CODE: Record<string, LedgerCode> = {
  order_payment: "order_payment",
  provider_earning: "provider_earning",
  platform_commission: "platform_commission",
  refund: "customer_refund",
  customer_refund: "customer_refund",
  provider_earning_reversal: "provider_earning_reversal",
  platform_commission_reversal: "platform_commission_reversal",
  provider_payout: "provider_payout",
  provider_payout_reversal: "provider_payout_reversal",
  dispute_opened: "dispute_opened",
  dispute_resolved: "dispute_resolved",
};

export function resolveLedgerCode(
  type: string | null | undefined,
  ledgerCode?: string | null
): LedgerCode | string {
  if (ledgerCode && LEDGER_CODES.includes(ledgerCode as LedgerCode)) {
    return ledgerCode;
  }
  if (type && LEGACY_TYPE_TO_CODE[type]) return LEGACY_TYPE_TO_CODE[type];
  return ledgerCode || type || "unknown";
}

const I18N_KEY: Record<LedgerCode, string> = {
  order_payment: "finance.transactionType.orderPayment",
  provider_earning: "finance.transactionType.providerEarning",
  platform_commission: "finance.transactionType.platformCommission",
  customer_refund: "finance.transactionType.customerRefund",
  provider_earning_reversal: "finance.transactionType.providerEarningReversal",
  platform_commission_reversal: "finance.transactionType.platformCommissionReversal",
  provider_payout: "finance.transactionType.providerPayout",
  provider_payout_reversal: "finance.transactionType.providerPayoutReversal",
  dispute_opened: "finance.transactionType.disputeOpened",
  dispute_resolved: "finance.transactionType.disputeResolved",
};

export function ledgerCodeI18nKey(code: string): string {
  return I18N_KEY[code as LedgerCode] ?? "finance.transactionType.unknown";
}

/**
 * Signed amount for a viewer role.
 * Positive = inflow to that party; negative = outflow.
 */
export function signedAmountForViewer(
  code: string,
  amount: number,
  amountSigned: number | null | undefined,
  viewer: "customer" | "provider" | "platform" | "admin"
): number {
  const abs = Math.abs(Number(amount) || 0);
  if (amountSigned != null && Number.isFinite(Number(amountSigned)) && viewer === "admin") {
    return Number(amountSigned);
  }

  switch (code) {
    case "order_payment":
      return viewer === "customer" || viewer === "admin" ? -abs : 0;
    case "customer_refund":
      return viewer === "customer" || viewer === "admin" ? abs : 0;
    case "provider_earning":
      return viewer === "provider" || viewer === "admin" ? abs : 0;
    case "provider_earning_reversal":
      return viewer === "provider" || viewer === "admin" ? -abs : 0;
    case "platform_commission":
      return viewer === "platform" || viewer === "admin" ? abs : 0;
    case "platform_commission_reversal":
      return viewer === "platform" || viewer === "admin" ? -abs : 0;
    case "provider_payout":
      return viewer === "provider" || viewer === "admin" ? -abs : 0;
    case "provider_payout_reversal":
      return viewer === "provider" || viewer === "admin" ? abs : 0;
    default:
      return 0;
  }
}

export function isMoneyLedgerCode(code: string): boolean {
  return ![
    "dispute_opened",
    "dispute_resolved",
  ].includes(code);
}

/** Expand TransactionType union helpers for UI filtering. */
export function isTransactionType(value: string): value is TransactionType {
  return value in LEGACY_TYPE_TO_CODE || LEDGER_CODES.includes(value as LedgerCode);
}

export function formatLedgerLabel(
  code: string,
  t: (key: string) => string
): string {
  return t(ledgerCodeI18nKey(code));
}
