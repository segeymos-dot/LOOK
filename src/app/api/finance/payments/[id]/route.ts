import { getMockOffers, getMockRequest } from "@/lib/mock/data";
import { getDemoPaymentForRequest, simulateDemoPayment } from "@/lib/mock/finance";
import { isDemoMode } from "@/lib/config";
import { getPaymentForRequest, simulateTestPayment } from "@/lib/data/finance-actions";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

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
    if (req.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: "Payment is only available for orders in progress" },
        { status: 400 }
      );
    }
    const offer = getMockOffers(requestId).find((o) => o.status === "accepted");
    if (!offer) {
      return NextResponse.json({ success: false, error: "No accepted offer" }, { status: 400 });
    }
    try {
      const data = simulateDemoPayment({
        requestId,
        offerId: offer.id,
        customerId: req.customer_id,
        providerId: offer.provider_id,
        grossAmount: Number(offer.price),
        currency: offer.currency,
      });
      return NextResponse.json({ success: true, ...data });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Payment failed" },
        { status: 400 }
      );
    }
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const result = await simulateTestPayment(auth.supabase, requestId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/balance");
  revalidatePath("/admin/platform");
  revalidatePath("/finance/transactions");

  return NextResponse.json({ success: true, ...result.data });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    const payment = getDemoPaymentForRequest(requestId);
    return NextResponse.json({ success: true, payment });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const payment = await getPaymentForRequest(auth.supabase, requestId);
  return NextResponse.json({ success: true, payment });
}
