import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeTestOrderPayment } from "@/lib/payments/order-payment";
import { areTestPaymentsEnabled } from "@/lib/payments/test-payments-guard";
import type {
  FinanceTransaction,
  Payment,
  PaymentSimulationResult,
  PlatformSummary,
  ProviderBalance,
} from "@/types";

export type FinanceResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getPaymentForRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<Payment | null> {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();

  return (data as Payment | null) ?? null;
}

export async function simulateTestPayment(
  supabase: SupabaseClient,
  requestId: string,
  externalReference?: string
): Promise<FinanceResult<PaymentSimulationResult>> {
  return executeTestOrderPayment(supabase, requestId, externalReference);
}

export async function getProviderBalance(
  supabase: SupabaseClient,
  providerId: string
): Promise<ProviderBalance | null> {
  const { data } = await supabase
    .from("provider_balances")
    .select("*")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (data) return data as ProviderBalance;

  return {
    provider_id: providerId,
    available_balance: 0,
    pending_payout: 0,
    total_earned: 0,
    currency: "USD",
    updated_at: new Date().toISOString(),
  };
}

export async function getPlatformSummary(
  supabase: SupabaseClient
): Promise<PlatformSummary> {
  const [{ data: payments }, { data: rateRow }, { data: ledger }] = await Promise.all([
    supabase.from("payments").select("amount_gross, currency, status"),
    supabase.from("platform_settings").select("value").eq("key", "commission_rate").maybeSingle(),
    supabase
      .from("transactions")
      .select("ledger_code, type, amount, amount_signed, currency, status")
      .eq("status", "completed")
      .in("ledger_code", [
        "platform_commission",
        "platform_commission_reversal",
      ]),
  ]);

  const paymentList = payments ?? [];
  const activePaid = paymentList.filter((p) => p.status === "paid");
  const ledgerRows = ledger ?? [];
  const currency =
    ledgerRows[0]?.currency ?? activePaid[0]?.currency ?? paymentList[0]?.currency ?? "USD";

  // Net LOOK revenue from immutable ledger (commission − reversals).
  const totalCommission = ledgerRows.reduce((sum, row) => {
    const code = row.ledger_code || row.type;
    const abs = Math.abs(Number(row.amount) || 0);
    if (code === "platform_commission") return sum + abs;
    if (code === "platform_commission_reversal") return sum - abs;
    return sum;
  }, 0);

  return {
    commission_rate: Number(rateRow?.value ?? 0.10),
    total_commission: Math.round(totalCommission * 100) / 100,
    paid_orders_count: activePaid.length,
    gross_volume: activePaid.reduce((s, p) => s + Number(p.amount_gross), 0),
    currency,
  };
}

export async function getTransactions(
  supabase: SupabaseClient,
  limit = 30
): Promise<FinanceTransaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as FinanceTransaction[];
}

export async function simulateTestPayout(
  _supabase: SupabaseClient,
  providerId: string,
  amount?: number
): Promise<FinanceResult<{ payout_id: string; amount: number; currency: string; status: string }>> {
  if (!areTestPaymentsEnabled()) {
    return { success: false, error: "Test payments are disabled" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is required for test payouts",
    };
  }

  const { data, error } = await admin.rpc("simulate_test_payout", {
    p_amount: amount ?? null,
    p_provider_id: providerId,
  });

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: data as { payout_id: string; amount: number; currency: string; status: string },
  };
}

export async function isPlatformAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();

  return Boolean(data?.is_platform_admin);
}
