import { fetchUserPaymentHistory } from "@/lib/data/payment-history-server";
import { getDemoPaymentHistory } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      history: getDemoPaymentHistory(auth.user.id),
    });
  }

  const history = await fetchUserPaymentHistory(auth.supabase, auth.user.id);
  return NextResponse.json({ success: true, history });
}
