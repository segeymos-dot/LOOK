import { getMockOffers, getMockRequest } from "@/lib/mock/data";
import { getDemoPaymentForRequest, simulateDemoPayment } from "@/lib/mock/finance";
import { getMockOrderPayment, initDemoOrderPayment, markMockOrderPaid } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import { getPaymentForRequest, simulateTestPayment } from "@/lib/data/finance-actions";
import { getOrderPaymentSnapshot } from "@/lib/payments/order-payment";
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
      const body = (await request.json()) as { external_reference?: string };
      if (!getMockOrderPayment(requestId)) {
        initDemoOrderPayment({
          requestId,
          customerId: req.customer_id,
          providerId: offer.provider_id,
          orderAmount: Number(offer.price),
          currency: offer.currency,
          requestTitle: req.title,
        });
      }
      const data = simulateDemoPayment({
        requestId,
        offerId: offer.id,
        customerId: req.customer_id,
        providerId: offer.provider_id,
        grossAmount: Number(offer.price),
        currency: offer.currency,
        externalReference: body.external_reference,
      });
      markMockOrderPaid(requestId, data.external_reference ?? data.payment_id);
      return NextResponse.json({ success: true, ...data, order_payment_status: "paid" as const });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Payment failed" },
        { status: 400 }
      );
    }
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  let externalReference: string | undefined;
  try {
    const body = (await request.json()) as { external_reference?: string };
    if (body.external_reference?.trim()) {
      externalReference = body.external_reference.trim();
    }
  } catch {
    // empty body is fine
  }

  // Test/simulate path — real charges are confirmed by /api/webhooks/stripe.
  const result = await simulateTestPayment(auth.supabase, requestId, externalReference);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/payment`);
  revalidatePath("/profile");
  revalidatePath("/my/balance");
  revalidatePath("/admin/platform");
  revalidatePath("/finance/transactions");

  return NextResponse.json({
    success: true,
    ...result.data,
    order_payment_status: result.data.order_payment_status ?? "paid",
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  if (isDemoMode()) {
    const payment = getDemoPaymentForRequest(requestId);
    const mockOrder = getMockOrderPayment(requestId);
    return NextResponse.json({
      success: true,
      payment,
      order_payment_status: mockOrder?.order_payment_status ?? (payment ? "paid" : "unpaid"),
    });
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const [payment, snapshot] = await Promise.all([
    getPaymentForRequest(auth.supabase, requestId),
    getOrderPaymentSnapshot(auth.supabase, requestId),
  ]);

  return NextResponse.json({
    success: true,
    payment,
    order_payment_status: snapshot?.orderPaymentStatus ?? (payment ? "paid" : "unpaid"),
  });
}
