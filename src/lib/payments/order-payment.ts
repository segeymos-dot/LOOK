import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_PROVIDER } from "@/lib/payments/constants";
import { isOrderPaymentPaid } from "@/lib/payments/order-lifecycle";
import {
  areProdSafeTestPaymentsEnabled,
  areTestPaymentsEnabled,
} from "@/lib/payments/test-payments-guard";
import type { OrderPaymentStatus, PaymentSimulationResult } from "@/types";

export type OrderPaymentSnapshot = {
  requestId: string;
  orderPaymentStatus: OrderPaymentStatus;
  orderAmount: number | null;
  lookCommission: number | null;
  providerPayoutAmount: number | null;
  currency: string;
  paymentProviderName: string | null;
  paymentTransactionId: string | null;
  payoutStatus: string | null;
  paidAt: string | null;
  isTest?: boolean;
};

type RequestPaymentRow = {
  id: string;
  currency: string;
  order_payment_status?: OrderPaymentStatus;
  order_amount?: number | null;
  look_commission?: number | null;
  provider_payout_amount?: number | null;
  payment_provider_name?: string | null;
  payment_transaction_id?: string | null;
  payout_status?: string | null;
  paid_at?: string | null;
  is_test?: boolean | null;
};

export function mapRequestPaymentRow(row: RequestPaymentRow): OrderPaymentSnapshot {
  return {
    requestId: row.id,
    orderPaymentStatus: row.order_payment_status ?? "unpaid",
    orderAmount: row.order_amount != null ? Number(row.order_amount) : null,
    lookCommission: row.look_commission != null ? Number(row.look_commission) : null,
    providerPayoutAmount:
      row.provider_payout_amount != null ? Number(row.provider_payout_amount) : null,
    currency: row.currency,
    paymentProviderName: row.payment_provider_name ?? null,
    paymentTransactionId: row.payment_transaction_id ?? null,
    payoutStatus: row.payout_status ?? null,
    paidAt: row.paid_at ?? null,
    isTest: Boolean(row.is_test),
  };
}

export async function getOrderPaymentSnapshot(
  supabase: SupabaseClient,
  requestId: string
): Promise<OrderPaymentSnapshot | null> {
  const withTest = await supabase
    .from("requests")
    .select(
      "id, currency, order_payment_status, order_amount, look_commission, provider_payout_amount, payment_provider_name, payment_transaction_id, payout_status, paid_at, is_test"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!withTest.error && withTest.data) {
    return mapRequestPaymentRow(withTest.data as RequestPaymentRow);
  }

  const fallback = await supabase
    .from("requests")
    .select(
      "id, currency, order_payment_status, order_amount, look_commission, provider_payout_amount, payment_provider_name, payment_transaction_id, payout_status, paid_at"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (fallback.error || !fallback.data) return null;
  return mapRequestPaymentRow(fallback.data as RequestPaymentRow);
}

/** Marks order as payment_pending before checkout UI. */
export async function beginTestOrderPayment(
  supabase: SupabaseClient,
  requestId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await supabase.rpc("begin_order_payment", {
    p_request_id: requestId,
  });

  if (error?.message?.includes("begin_order_payment")) {
    return { success: true };
  }

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Simulated test payment via service_role RPC (Preview / local ENABLE_TEST_PAYMENTS).
 */
export async function executeTestOrderPayment(
  _supabase: SupabaseClient,
  requestId: string,
  externalReference?: string
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  if (!areTestPaymentsEnabled()) {
    return { success: false, error: "Test payments are disabled" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is required for test payments",
    };
  }

  let { data, error } = await admin.rpc("simulate_test_payment", {
    p_request_id: requestId,
    p_external_reference: externalReference ?? null,
  });

  if (error?.message?.includes("p_external_reference")) {
    ({ data, error } = await admin.rpc("simulate_test_payment", {
      p_request_id: requestId,
    }));
  }

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as PaymentSimulationResult;
  return {
    success: true,
    data: {
      ...result,
      payment_provider: PAYMENT_PROVIDER.LOOK_TEST,
    },
  };
}

/**
 * Production-safe test payment via authenticated SECURITY DEFINER RPC.
 * No service_role required. No Stripe. No provider_balances credit.
 */
export async function executeProdSafeTestPayment(
  supabase: SupabaseClient,
  requestId: string,
  externalReference?: string
): Promise<{ success: true; data: PaymentSimulationResult } | { success: false; error: string }> {
  if (!areProdSafeTestPaymentsEnabled()) {
    return { success: false, error: "Production test payments are disabled" };
  }

  const { data, error } = await supabase.rpc("simulate_prod_safe_test_payment", {
    p_request_id: requestId,
    p_external_reference: externalReference ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as PaymentSimulationResult & {
    order_payment_status?: OrderPaymentStatus;
  };

  return {
    success: true,
    data: {
      ...result,
      payment_provider: PAYMENT_PROVIDER.LOOK_TEST,
      order_payment_status: result.order_payment_status ?? "paid",
    },
  };
}

export function isOrderPaidForWork(status: OrderPaymentStatus | undefined): boolean {
  return isOrderPaymentPaid(status);
}

export function isTestPaymentMethod(method: string | null | undefined): boolean {
  const m = (method ?? "").toLowerCase();
  return (
    m === "test" ||
    m === "look_test" ||
    m.startsWith("test") ||
    m.startsWith("look_test")
  );
}
