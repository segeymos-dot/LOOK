import { getMockRequest } from "@/lib/mock/data";
import { setMockOrderPaymentPending } from "@/lib/mock/order-payments";
import { isDemoMode } from "@/lib/config";
import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { getAppOrigin } from "@/lib/app-url";
import { isStripeConfigured, missingStripeEnvVars } from "@/lib/payments/stripe";
import { createOrderCheckoutSession } from "@/lib/payments/stripe-order-payment";
import { areTestPaymentsEnabled } from "@/lib/payments/test-payments-guard";
import { NextResponse } from "next/server";

/**
 * Creates a Stripe Checkout Session for the order and returns the hosted URL.
 * Requires STRIPE_SECRET_KEY. Payment is finalized by the Stripe webhook.
 */
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
    return NextResponse.json({
      success: false,
      error: "Stripe Checkout is unavailable in demo mode. Use the test checkout form.",
      demo_fallback: true,
    }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    const allowTestFallback = areTestPaymentsEnabled();
    return NextResponse.json(
      {
        success: false,
        error: allowTestFallback
          ? "Stripe is not configured"
          : "Stripe is not configured. Test payments are disabled.",
        missing_env: missingStripeEnvVars(),
        // Only signal UI fake-card fallback when the private server flag is on.
        test_fallback: allowTestFallback,
      },
      { status: 503 }
    );
  }

  const auth = await getFinanceApiUser(request);
  if ("error" in auth) return auth.error;

  const { data: order, error: orderError } = await auth.supabase
    .from("requests")
    .select("id, title, customer_id, status, currency, order_amount, order_payment_status")
    .eq("id", requestId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  }

  if (order.customer_id !== auth.user.id) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  if (order.status !== "in_progress") {
    return NextResponse.json(
      { success: false, error: "Payment is only available for orders in progress" },
      { status: 400 }
    );
  }

  if (order.order_payment_status === "paid" || order.order_payment_status === "completed") {
    return NextResponse.json({ success: false, error: "Order is already paid" }, { status: 400 });
  }

  const { data: offer } = await auth.supabase
    .from("offers")
    .select("price, currency")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) {
    return NextResponse.json({ success: false, error: "No accepted offer" }, { status: 400 });
  }

  const amount = Number(order.order_amount ?? offer.price);
  const currency = String(order.currency ?? offer.currency ?? "USD");
  const origin = getAppOrigin(request.headers.get("origin") ?? undefined);

  const result = await createOrderCheckoutSession(
    auth.supabase,
    {
      requestId,
      customerId: auth.user.id,
      customerEmail: auth.user.email,
      title: order.title ?? "LOOK order",
      amount,
      currency,
    },
    origin
  );

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    checkout_url: result.data.url,
    session_id: result.data.sessionId,
    payment_intent_id: result.data.paymentIntentId,
    order_payment_status: "payment_pending",
  });
}
