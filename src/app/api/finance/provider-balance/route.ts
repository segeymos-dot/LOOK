import {
  getDemoProviderBalance,
  simulateDemoPayout,
} from "@/lib/mock/finance";
import { isDemoMode } from "@/lib/config";
import {
  getProviderBalance,
  simulateTestPayout,
} from "@/lib/data/finance-actions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { canActAsProvider } from "@/lib/auth/roles";
import { authorizeTestPayout } from "@/lib/payments/test-payment-authorization";
import {
  areTestPaymentsEnabled,
  testPaymentsDisabledJson,
} from "@/lib/payments/test-payments-guard";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (isDemoMode()) {
    const providerId = request.headers.get("x-provider-id") ?? "user-2";
    return NextResponse.json({
      success: true,
      balance: getDemoProviderBalance(providerId),
      test_payments_enabled: areTestPaymentsEnabled(),
    });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!canActAsProvider(profile?.role)) {
    return NextResponse.json(
      { success: false, error: "Доступно только исполнителям" },
      { status: 403 }
    );
  }

  const balance = await getProviderBalance(auth.supabase, auth.user.id);
  return NextResponse.json({
    success: true,
    balance,
    test_payments_enabled: areTestPaymentsEnabled(),
  });
}

export async function POST(request: Request) {
  if (!areTestPaymentsEnabled()) {
    return NextResponse.json(testPaymentsDisabledJson(), { status: 403 });
  }

  if (isDemoMode()) {
    try {
      const body = await request.json().catch(() => ({}));
      const providerId = body.provider_id ?? "user-2";
      const data = simulateDemoPayout(providerId, body.amount);
      return NextResponse.json({ success: true, ...data });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Payout failed" },
        { status: 400 }
      );
    }
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  const authz = authorizeTestPayout({
    authenticatedUserId: auth.user.id,
    canActAsProvider: canActAsProvider(profile?.role),
  });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  // Ignore client-supplied provider_id / status — always the authenticated provider.
  const body = await request.json().catch(() => ({}));
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : undefined;

  const result = await simulateTestPayout(auth.supabase, auth.user.id, amount);

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath("/my/balance");
  revalidatePath("/finance/transactions");

  return NextResponse.json({ success: true, ...result.data });
}
