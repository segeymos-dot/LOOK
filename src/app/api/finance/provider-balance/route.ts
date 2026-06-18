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
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (isDemoMode()) {
    const providerId = request.headers.get("x-provider-id") ?? "user-2";
    return NextResponse.json({
      success: true,
      balance: getDemoProviderBalance(providerId),
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
  return NextResponse.json({ success: true, balance });
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const result = await simulateTestPayout(auth.supabase, body.amount);

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath("/my/balance");
  revalidatePath("/finance/transactions");

  return NextResponse.json({ success: true, ...result.data });
}
