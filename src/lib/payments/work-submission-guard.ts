import type { SupabaseClient } from "@supabase/supabase-js";

export const PAYMENT_REQUIRED_CODE = "PAYMENT_REQUIRED" as const;

export const PAYMENT_REQUIRED_MESSAGE =
  "Order must be paid before work can be submitted.";

export type PaymentRequiredResult = {
  success: false;
  error: typeof PAYMENT_REQUIRED_MESSAGE;
  code: typeof PAYMENT_REQUIRED_CODE;
};

export function paymentRequiredResult(): PaymentRequiredResult {
  return {
    success: false,
    error: PAYMENT_REQUIRED_MESSAGE,
    code: PAYMENT_REQUIRED_CODE,
  };
}

export function isPaymentRequiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes(PAYMENT_REQUIRED_CODE) ||
    lower.includes("order must be paid before work can be submitted")
  );
}

/**
 * Server-side guard: providers may not submit work until the order is paid.
 * Authoritative source: payments.status = 'paid' only.
 * Do not trust requests.order_payment_status (customer-writable snapshot before 042).
 */
export async function isOrderPaidForWorkSubmission(
  supabase: SupabaseClient,
  requestId: string
): Promise<boolean> {
  const { data: payment } = await supabase
    .from("payments")
    .select("status")
    .eq("request_id", requestId)
    .eq("status", "paid")
    .maybeSingle();

  return payment?.status === "paid";
}

export async function assertOrderPaidForWorkSubmission(
  supabase: SupabaseClient,
  requestId: string
): Promise<{ ok: true } | PaymentRequiredResult> {
  const paid = await isOrderPaidForWorkSubmission(supabase, requestId);
  if (!paid) {
    return paymentRequiredResult();
  }
  return { ok: true };
}
