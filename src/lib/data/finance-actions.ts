import type { SupabaseClient } from "@supabase/supabase-js";
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
  requestId: string
): Promise<FinanceResult<PaymentSimulationResult>> {
  const { data, error } = await supabase.rpc("simulate_test_payment", {
    p_request_id: requestId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as PaymentSimulationResult };
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
  const [{ data: commissions }, { data: payments }, { data: rateRow }] = await Promise.all([
    supabase.from("platform_commissions").select("commission_amount, currency"),
    supabase.from("payments").select("amount_gross, currency").eq("status", "paid"),
    supabase.from("platform_settings").select("value").eq("key", "commission_rate").maybeSingle(),
  ]);

  const commissionList = commissions ?? [];
  const paymentList = payments ?? [];
  const currency = commissionList[0]?.currency ?? paymentList[0]?.currency ?? "USD";

  return {
    commission_rate: Number(rateRow?.value ?? 0.15),
    total_commission: commissionList.reduce((s, c) => s + Number(c.commission_amount), 0),
    paid_orders_count: paymentList.length,
    gross_volume: paymentList.reduce((s, p) => s + Number(p.amount_gross), 0),
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
  supabase: SupabaseClient,
  amount?: number
): Promise<FinanceResult<{ payout_id: string; amount: number; currency: string; status: string }>> {
  const { data, error } = await supabase.rpc("simulate_test_payout", {
    p_amount: amount ?? null,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as { payout_id: string; amount: number; currency: string; status: string } };
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
