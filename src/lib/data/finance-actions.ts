import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeTestOrderPayment } from "@/lib/payments/order-payment";
import { areTestPaymentsEnabled } from "@/lib/payments/test-payments-guard";
import {
  isLedgerVisibleToScope,
  ledgerCodesForScope,
  resolveLedgerCode,
  type TransactionViewerScope,
} from "@/lib/finance/ledger";
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

export type GetTransactionsOptions = {
  limit?: number;
  scope: TransactionViewerScope;
  userId: string;
};

/**
 * Role-scoped ledger listing. Filters by ledger_code / account_scope so
 * providers never see customer refunds or LOOK commission rows (and vice versa).
 * Admins receive the full shared audit trail.
 */
export async function getTransactions(
  supabase: SupabaseClient,
  options: GetTransactionsOptions
): Promise<FinanceTransaction[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const codes = ledgerCodesForScope(options.scope);
  // Over-fetch when post-filtering party / legacy rows so the page still fills.
  const fetchLimit =
    options.scope === "admin" ? limit : Math.min(Math.max(limit * 4, limit), 200);

  let query = supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (options.scope === "provider") {
    query = query.eq("provider_id", options.userId).or(
      `ledger_code.in.(${(codes ?? []).join(",")}),type.in.(${(codes ?? []).join(",")})`
    );
  } else if (options.scope === "customer") {
    query = query.eq("user_id", options.userId).or(
      `ledger_code.in.(${(codes ?? []).join(",")}),type.in.(order_payment,refund,customer_refund)`
    );
  } else if (options.scope === "platform") {
    query = query.or(
      `ledger_code.in.(${(codes ?? []).join(",")}),type.in.(${(codes ?? []).join(",")}),account_scope.eq.platform`
    );
  } else if (options.scope === "party") {
    query = query.or(
      `user_id.eq.${options.userId},provider_id.eq.${options.userId}`
    );
  }
  // admin: unfiltered audit trail (RLS still requires platform admin)

  const { data } = await query;
  const rows = (data ?? []) as FinanceTransaction[];

  const filtered = rows.filter((tx) => {
    const code = String(resolveLedgerCode(tx.type, tx.ledger_code));
    if (!isLedgerVisibleToScope(code, options.scope)) return false;
    if (options.scope === "provider" && tx.provider_id !== options.userId) {
      return false;
    }
    if (options.scope === "customer" && tx.user_id !== options.userId) {
      return false;
    }
    if (
      options.scope === "party" &&
      tx.user_id !== options.userId &&
      tx.provider_id !== options.userId
    ) {
      return false;
    }
    return true;
  });

  return filtered.slice(0, limit);
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
