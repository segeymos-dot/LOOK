import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderPaymentStatus, PaymentHistoryEntry, PaymentStatus } from "@/types";

export async function fetchUserPaymentHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 20
): Promise<PaymentHistoryEntry[]> {
  const { data: asCustomer } = await supabase
    .from("payments")
    .select(
      "id, request_id, amount_gross, platform_fee, provider_amount, currency, status, external_reference, paid_at, created_at, payment_method, request:requests(title, order_payment_status, payment_provider_name, payment_transaction_id, payout_status, paid_at)"
    )
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: asProvider } = await supabase
    .from("payments")
    .select(
      "id, request_id, amount_gross, platform_fee, provider_amount, currency, status, external_reference, paid_at, created_at, payment_method, request:requests(title, order_payment_status, payment_provider_name, payment_transaction_id, payout_status, paid_at)"
    )
    .eq("provider_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const mapRow = (
    row: Record<string, unknown>,
    role: "customer" | "provider"
  ): PaymentHistoryEntry => {
    const req = row.request as Record<string, unknown> | null;
    return {
      id: String(row.id),
      request_id: String(row.request_id),
      request_title: String(req?.title ?? "—"),
      role,
      amount_gross: Number(row.amount_gross),
      platform_fee: Number(row.platform_fee),
      provider_amount: Number(row.provider_amount),
      currency: String(row.currency),
      payment_status: row.status as PaymentStatus,
      order_payment_status: (req?.order_payment_status as OrderPaymentStatus) ?? null,
      payment_provider_name:
        (req?.payment_provider_name as string) ?? (row.payment_method as string) ?? null,
      payment_transaction_id:
        (req?.payment_transaction_id as string) ?? (row.external_reference as string) ?? null,
      payout_status: (req?.payout_status as string) ?? null,
      paid_at: (row.paid_at as string) ?? (req?.paid_at as string) ?? null,
      created_at: String(row.created_at),
    };
  };

  const merged = [
    ...(asCustomer ?? []).map((r) => mapRow(r as Record<string, unknown>, "customer")),
    ...(asProvider ?? []).map((r) => mapRow(r as Record<string, unknown>, "provider")),
  ];

  merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const seen = new Set<string>();
  return merged.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  }).slice(0, limit);
}
