import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrderPaidForWork } from "@/lib/payments/order-payment";
import type { OrderPaymentStatus } from "@/types";

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
 * UI checks are not sufficient — this must run before every work-submission path.
 *
 * Accepted states:
 * - payments.status = 'paid'
 * - OR requests.order_payment_status IN ('paid', 'completed') when column exists
 */
export async function isOrderPaidForWorkSubmission(
  supabase: SupabaseClient,
  requestId: string
): Promise<boolean> {
  const { data: payment } = await supabase
    .from("payments")
    .select("status")
    .eq("request_id", requestId)
    .maybeSingle();

  if (payment?.status === "paid") {
    return true;
  }

  const { data: request, error } = await supabase
    .from("requests")
    .select("order_payment_status")
    .eq("id", requestId)
    .maybeSingle();

  if (error?.message?.includes("order_payment_status")) {
    return false;
  }

  return isOrderPaidForWork(request?.order_payment_status as OrderPaymentStatus | undefined);
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
