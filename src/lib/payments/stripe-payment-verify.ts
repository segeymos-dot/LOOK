/**
 * Server-side Stripe amount/currency verification.
 * Compares Stripe minor units against the order's expected major units.
 * Never trusts client-provided amounts or commission splits.
 *
 * Keep this module free of path aliases so Node security tests can import it.
 */

/** Currencies with zero decimal places in Stripe (subset mirrored from stripe.ts). */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

function toStripeAmountMinor(amount: number, currency: string): number {
  const code = currency.trim().toLowerCase();
  if (ZERO_DECIMAL.has(code)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

export type StripeAmountCheckInput = {
  /** Stripe amount in minor units (e.g. cents), or major for zero-decimal currencies. */
  stripeAmountMinor: number | null | undefined;
  stripeCurrency: string | null | undefined;
  expectedAmountMajor: number | null | undefined;
  expectedCurrency: string | null | undefined;
};

export type StripeAmountCheckResult =
  | { ok: true; expectedMinor: number; currency: string; amountMajor: number }
  | { ok: false; error: string };

export function verifyStripeAmountAndCurrency(
  input: StripeAmountCheckInput
): StripeAmountCheckResult {
  const expectedMajor = Number(input.expectedAmountMajor);
  if (!Number.isFinite(expectedMajor) || expectedMajor <= 0) {
    return { ok: false, error: "Invalid expected order amount" };
  }

  const expectedCurrency = (input.expectedCurrency ?? "").trim().toLowerCase();
  if (!expectedCurrency) {
    return { ok: false, error: "Missing expected order currency" };
  }

  const stripeCurrency = (input.stripeCurrency ?? "").trim().toLowerCase();
  if (!stripeCurrency) {
    return { ok: false, error: "Missing Stripe currency" };
  }

  if (stripeCurrency !== expectedCurrency) {
    return { ok: false, error: "Stripe currency does not match expected order currency" };
  }

  if (input.stripeAmountMinor == null || !Number.isFinite(Number(input.stripeAmountMinor))) {
    return { ok: false, error: "Missing Stripe amount" };
  }

  const stripeMinor = Math.trunc(Number(input.stripeAmountMinor));
  const expectedMinor = toStripeAmountMinor(expectedMajor, expectedCurrency);

  if (stripeMinor !== expectedMinor) {
    return { ok: false, error: "Stripe amount does not match expected order amount" };
  }

  return {
    ok: true,
    expectedMinor,
    currency: expectedCurrency,
    amountMajor: expectedMajor,
  };
}

/**
 * Resolve request/order id only from verified Stripe object metadata.
 * Never from client query params alone.
 */
export function resolveStripeRequestId(meta: {
  metadataRequestId?: string | null;
  clientReferenceId?: string | null;
}): string | null {
  const fromMeta = meta.metadataRequestId?.trim();
  if (fromMeta) return fromMeta;
  const fromRef = meta.clientReferenceId?.trim();
  return fromRef || null;
}

export function assertStripeSessionMatchesOrder(
  sessionRequestId: string | null | undefined,
  expectedRequestId: string
): { ok: true } | { ok: false; error: string } {
  if (!sessionRequestId || sessionRequestId !== expectedRequestId) {
    return { ok: false, error: "Checkout session does not match this order" };
  }
  return { ok: true };
}
