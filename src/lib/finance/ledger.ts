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

/** Who is viewing a balance / transaction list. */
export type TransactionViewerScope =
  | "customer"
  | "provider"
  | "platform"
  | "admin"
  /** Customer+provider legs for dual-role users — never platform/system. */
  | "party";

/** Ledger codes visible on each non-admin balance surface. */
export const LEDGER_CODES_BY_SCOPE: Record<
  Exclude<TransactionViewerScope, "admin">,
  readonly LedgerCode[]
> = {
  customer: ["order_payment", "customer_refund"],
  provider: [
    "provider_earning",
    "provider_earning_reversal",
    "provider_payout",
    "provider_payout_reversal",
  ],
  platform: ["platform_commission", "platform_commission_reversal"],
  party: [
    "order_payment",
    "customer_refund",
    "provider_earning",
    "provider_earning_reversal",
    "provider_payout",
    "provider_payout_reversal",
  ],
};

export function ledgerCodesForScope(
  scope: TransactionViewerScope
): readonly LedgerCode[] | null {
  if (scope === "admin") return null; // full audit trail
  return LEDGER_CODES_BY_SCOPE[scope];
}

export function isLedgerVisibleToScope(
  code: string,
  scope: TransactionViewerScope
): boolean {
  if (scope === "admin") return true;
  const allowed = LEDGER_CODES_BY_SCOPE[scope];
  return allowed.includes(code as LedgerCode);
}

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

export type AmountViewer =
  | "customer"
  | "provider"
  | "platform"
  | "admin"
  | "party";

/**
 * Pick the sign perspective for a ledger row.
 * Dual-role ("party") lists use the owning party's sign per row.
 */
export function amountViewerForLedgerCode(
  code: string,
  viewer: AmountViewer
): Exclude<AmountViewer, "party"> {
  if (viewer !== "party") return viewer;
  if (LEDGER_CODES_BY_SCOPE.provider.includes(code as LedgerCode)) return "provider";
  if (LEDGER_CODES_BY_SCOPE.platform.includes(code as LedgerCode)) return "platform";
  return "customer";
}

/**
 * Signed amount for a viewer role.
 * Positive = inflow to that party; negative = outflow.
 */
export function signedAmountForViewer(
  code: string,
  amount: number,
  amountSigned: number | null | undefined,
  viewer: AmountViewer
): number {
  const abs = Math.abs(Number(amount) || 0);
  const effective = amountViewerForLedgerCode(code, viewer);

  if (
    amountSigned != null &&
    Number.isFinite(Number(amountSigned)) &&
    effective === "admin"
  ) {
    return Number(amountSigned);
  }

  switch (code) {
    case "order_payment":
      return effective === "customer" || effective === "admin" ? -abs : 0;
    case "customer_refund":
      return effective === "customer" || effective === "admin" ? abs : 0;
    case "provider_earning":
      return effective === "provider" || effective === "admin" ? abs : 0;
    case "provider_earning_reversal":
      return effective === "provider" || effective === "admin" ? -abs : 0;
    case "platform_commission":
      return effective === "platform" || effective === "admin" ? abs : 0;
    case "platform_commission_reversal":
      return effective === "platform" || effective === "admin" ? -abs : 0;
    case "provider_payout":
      return effective === "provider" || effective === "admin" ? -abs : 0;
    case "provider_payout_reversal":
      return effective === "provider" || effective === "admin" ? abs : 0;
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
