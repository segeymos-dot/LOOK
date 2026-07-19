import { getMockRequest } from "@/lib/mock/data";
import { setMockOrderPaymentPending } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import { beginTestOrderPayment } from "@/lib/payments/order-payment";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { NextResponse } from "next/server";

/** Marks order as payment_pending before checkout (test / future PSP redirect). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    const req = getMockRequest(requestId);
    if (!req) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    setMockOrderPaymentPending(requestId);
    return NextResponse.json({ success: true });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const result = await beginTestOrderPayment(auth.supabase, requestId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
