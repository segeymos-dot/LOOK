import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderPaymentStatus } from "@/types";

/** Columns present on production requests (022 + 068). Never require 028 Stripe session columns. */
export const CHECKOUT_ORDER_CORE_SELECT =
  "id, title, customer_id, status, currency, order_amount, order_payment_status, is_test, payment_provider_name, payment_transaction_id";

const CHECKOUT_ORDER_CORE_SELECT_NO_TEST =
  "id, title, customer_id, status, currency, order_amount, order_payment_status, payment_provider_name, payment_transaction_id";

const CHECKOUT_ORDER_STRIPE_SELECT =
  "stripe_checkout_session_id, stripe_checkout_attempt, stripe_payment_intent_id";

export type CheckoutOrderRow = {
  id: string;
  title: string | null;
  customer_id: string;
  status: string;
  currency: string | null;
  order_amount: number | null;
  order_payment_status: OrderPaymentStatus | null;
  is_test?: boolean | null;
  payment_provider_name?: string | null;
  payment_transaction_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_checkout_attempt?: number | null;
  stripe_payment_intent_id?: string | null;
};

export function isMissingColumnError(error: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /column .* does not exist/i.test(msg) ||
    /Could not find the .* column/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

export type LoadCheckoutOrderResult =
  | { ok: true; order: CheckoutOrderRow }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "schema"; error: string };

/**
 * Load an order for checkout using the production-canonical request row.
 * Optional 028 Stripe session columns are probed separately and never required.
 */
export async function loadOrderForCheckout(
  supabase: SupabaseClient,
  requestId: string
): Promise<LoadCheckoutOrderResult> {
  let core = await supabase
    .from("requests")
    .select(CHECKOUT_ORDER_CORE_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (core.error && isMissingColumnError(core.error)) {
    core = await supabase
      .from("requests")
      .select(CHECKOUT_ORDER_CORE_SELECT_NO_TEST)
      .eq("id", requestId)
      .maybeSingle();
  }

  if (core.error) {
    if (isMissingColumnError(core.error)) {
      return { ok: false, kind: "schema", error: core.error.message };
    }
    return { ok: false, kind: "not_found" };
  }

  if (!core.data) {
    return { ok: false, kind: "not_found" };
  }

  const order = core.data as CheckoutOrderRow;

  const stripeCols = await supabase
    .from("requests")
    .select(CHECKOUT_ORDER_STRIPE_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (!stripeCols.error && stripeCols.data) {
    const extra = stripeCols.data as {
      stripe_checkout_session_id?: string | null;
      stripe_checkout_attempt?: number | null;
      stripe_payment_intent_id?: string | null;
    };
    order.stripe_checkout_session_id = extra.stripe_checkout_session_id ?? null;
    order.stripe_checkout_attempt = extra.stripe_checkout_attempt ?? null;
    order.stripe_payment_intent_id = extra.stripe_payment_intent_id ?? null;
  }

  return { ok: true, order };
}
